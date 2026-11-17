#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winternl.h>
#include <cfapi.h>
#include <napi.h>
#include <string>

// Main-process only. No unlink fallback, no ignored ACL merge errors, and no
// unsupported REPLACEFILE_WRITE_THROUGH flag. The JS writer reconciles hashes.
static std::wstring Path(const Napi::CallbackInfo& info, size_t index) {
  if (info.Length() <= index || !info[index].IsString())
    throw Napi::TypeError::New(info.Env(), "INVALID_PATH");
  std::u16string value = info[index].As<Napi::String>().Utf16Value();
  if (value.empty() || value.find(u'\0') != std::u16string::npos)
    throw Napi::TypeError::New(info.Env(), "INVALID_PATH");
  return std::wstring(value.begin(), value.end());
}
static void Failure(Napi::Env env, DWORD code) {
  auto error = Napi::Error::New(env, "WINDOWS_FILE_OPERATION_FAILED");
  error.Set("win32Code", Napi::Number::New(env, code));
  throw error;
}
static Napi::Value Replace(const Napi::CallbackInfo& info) {
  auto destination = Path(info, 0), temporary = Path(info, 1), backup = Path(info, 2);
  if (!ReplaceFileW(destination.c_str(), temporary.c_str(), backup.c_str(), 0, nullptr, nullptr))
    Failure(info.Env(), GetLastError());
  return info.Env().Undefined();
}
static Napi::Value Create(const Napi::CallbackInfo& info) {
  auto destination = Path(info, 0), temporary = Path(info, 1);
  // Without MOVEFILE_REPLACE_EXISTING, a destination created in the meantime
  // fails rather than overwriting it. Same-volume temporary is imposed by main.
  if (!MoveFileExW(temporary.c_str(), destination.c_str(), MOVEFILE_WRITE_THROUGH))
    Failure(info.Env(), GetLastError());
  return info.Env().Undefined();
}
static Napi::Value Flush(const Napi::CallbackInfo& info) {
  auto path = Path(info, 0);
  HANDLE handle = CreateFileW(path.c_str(), GENERIC_WRITE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL, nullptr);
  if (handle == INVALID_HANDLE_VALUE) Failure(info.Env(), GetLastError());
  BOOL success = FlushFileBuffers(handle); DWORD error = success ? ERROR_SUCCESS : GetLastError();
  CloseHandle(handle); if (!success) Failure(info.Env(), error);
  return info.Env().Undefined();
}
static Napi::Value CheckPath(const Napi::CallbackInfo& info) {
  auto path = Path(info, 0);
  if (path.size() < 3 || path[1] != L':' || path[2] != L'\\')
    throw Napi::Error::New(info.Env(), "UNSUPPORTED_LOCAL_PATH");
  const auto root = path.substr(0, 3);
  const UINT drive = GetDriveTypeW(root.c_str());
  if (drive != DRIVE_FIXED && drive != DRIVE_REMOVABLE)
    throw Napi::Error::New(info.Env(), "UNSUPPORTED_LOCAL_PATH");
  wchar_t filesystem[MAX_PATH] = {}, volume[MAX_PATH] = {};
  DWORD serial = 0, flags = 0;
  if (!GetVolumeInformationW(root.c_str(), nullptr, 0, &serial, nullptr, &flags, filesystem, MAX_PATH))
    Failure(info.Env(), GetLastError());
  if (!GetVolumeNameForVolumeMountPointW(root.c_str(), volume, MAX_PATH))
    Failure(info.Env(), GetLastError());
  // Reject junctions, symbolic links, cloud placeholders and offline content
  // on the selected file and every existing ancestor. A new leaf is allowed.
  bool leaf = true;
  while (path.size() > 3) {
    const DWORD attributes = GetFileAttributesW(path.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES) {
      const DWORD error = GetLastError();
      if (!leaf || error != ERROR_FILE_NOT_FOUND) Failure(info.Env(), error);
    } else if (attributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_OFFLINE | 0x00400000 | 0x00040000)) {
      throw Napi::Error::New(info.Env(), "UNSUPPORTED_LOCAL_PATH");
    } else {
      CF_SYNC_ROOT_BASIC_INFO sync = {};
      HRESULT cloud = CfGetSyncRootInfoByPath(path.c_str(), CF_SYNC_ROOT_INFO_BASIC, &sync, sizeof(sync), nullptr);
      if (SUCCEEDED(cloud)) throw Napi::Error::New(info.Env(), "UNSUPPORTED_SYNC_PATH");
      if (cloud != HRESULT_FROM_WIN32(ERROR_NOT_A_CLOUD_FILE) && cloud != HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED) && cloud != HRESULT_FROM_WIN32(ERROR_INVALID_FUNCTION))
        Failure(info.Env(), static_cast<DWORD>(cloud));
    }
    const auto separator = path.find_last_of(L'\\');
    if (separator == std::wstring::npos || separator < 3) break;
    path.resize(separator); leaf = false;
  }
  auto result = Napi::Object::New(info.Env());
  result.Set("volume", Napi::String::New(info.Env(), reinterpret_cast<const char16_t*>(volume)));
  result.Set("serial", Napi::Number::New(info.Env(), serial));
  result.Set("filesystem", Napi::String::New(info.Env(), reinterpret_cast<const char16_t*>(filesystem)));
  result.Set("readOnly", Napi::Boolean::New(info.Env(), (flags & FILE_READ_ONLY_VOLUME) != 0));
  return result;
}
static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("replace", Napi::Function::New(env, Replace));
  exports.Set("create", Napi::Function::New(env, Create));
  exports.Set("flush", Napi::Function::New(env, Flush));
  exports.Set("checkPath", Napi::Function::New(env, CheckPath));
  return exports;
}
NODE_API_MODULE(file_replace, Init)
