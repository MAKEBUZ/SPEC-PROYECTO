{
  "targets": [{
    "target_name": "file_replace",
    "sources": ["file-replace.cc"],
    "libraries": ["CldApi.lib"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_CPP_EXCEPTIONS", "UNICODE", "_UNICODE"],
    "msvs_settings": {"VCCLCompilerTool": {"ExceptionHandling": 1, "AdditionalOptions": ["/std:c++17"]}},
    "conditions": [["OS!='win'", {"type":"none"}]]
  }]
}
