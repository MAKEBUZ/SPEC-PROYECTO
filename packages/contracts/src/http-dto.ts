import { string, integer, enumeration, boolean, record, list, nullable, union, jsonValue,positiveNumber } from './schema.js';
import type { Contract, Value } from './schema.js';
import { ValidationError } from './validation.js';

const id = string('uuid'), hash = string('sha256'), text = string(), name = string('nonempty'), date = string('date-time');
const op = { operationId: id }, retry = { retryOf: id }, confirm = enumeration(true);
const kind = enumeration('project', 'pattern');
const fileBase = { id, originalName: text, mediaType: name, bytes: integer(0, 100000000), sha256: hash, documentId: id, localRevisionId: hash };
const pdfPages=list(record({widthMm:positiveNumber,heightMm:positiveNumber}));
const pdfMeasurementBase=record({exportProfileId:name,scale:enumeration(1),pages:pdfPages});
const pdfMeasurement:typeof pdfMeasurementBase={json:{...pdfMeasurementBase.json,properties:{...(pdfMeasurementBase.json.properties as Record<string,unknown>),pages:{...pdfPages.json,minItems:1,maxItems:250}}},parse(input){const v=pdfMeasurementBase.parse(input);if(v.pages.length<1||v.pages.length>250)throw new ValidationError('INVALID_INPUT');return v;}};
const file = union(
  record({ ...fileBase, role: enumeration('editable') }),
  record({ ...fileBase, role: enumeration('preview'), exportProfileId: name }),
  record({ ...fileBase, role: enumeration('pdf'), exportProfileId: name, preparationId: id, preparationHash: hash },{measurement:pdfMeasurement}),
);
const manifestFileBase = { fileId: id, originalName: text, mediaType: name, bytes: integer(0, 100000000), sha256: hash };
const manifestFile = union(
  record({ ...manifestFileBase, role: enumeration('editable') }),
  record({ ...manifestFileBase, role: enumeration('preview'), exportProfileId: name }),
  record({ ...manifestFileBase, role: enumeration('pdf'), exportProfileId: name, preparationId: id, preparationHash: hash }),
);
const manifestStructure = record({ documentId: id, localRevisionId: hash, files: list(manifestFile), manifestHash: hash });
const manifest: typeof manifestStructure = { json: { ...manifestStructure.json, description: 'Exactamente un editable y una preview; IDs de archivo únicos. SHA-256 comprobados por el servidor.' }, parse(input) {
  const value = manifestStructure.parse(input);
  if (value.files.filter(file => file.role === 'editable').length !== 1 || value.files.filter(file => file.role === 'preview').length !== 1 || new Set(value.files.map(file => file.fileId)).size !== value.files.length) throw new ValidationError('INVALID_INPUT');
  return value;
} };
const newPublication = record({ ...op, projectId: id, patternName: name, manifest }, retry);
const updatePublication = record({ ...op, projectId: id, patternId: id, expectedVersionId: id, manifest }, retry);
const project = record({ id, name, ownerId: id, state: name, createdAt: date, updatedAt: date, resourceRevision: name, trashedAt: nullable(date), expiresAt: nullable(date) });
const pattern = record({ id, projectId: id, ownerId: id, name, state: name, latestVersionId: nullable(id), resourceRevision: name, trashedAt: nullable(date), expiresAt: nullable(date) });
const version = record({ id, patternId: id, ordinal: integer(1), authorId: id, createdAt: date, localRevisionId: hash, files: list(file), commitOperationId: id });
const trash = record({ kind, id, name, trashedAt: date, expiresAt: date, causeOperationId: id, independentFromProjectDeletion: boolean, recoverable: boolean }, { parentProjectId: id });
export const DTO = {
  PdfMeasurement:pdfMeasurement,
  CsrfView: record({ token: name }),
  Register: record({ ...op, email: name, password: text }, { ...retry, displayName: text }),
  Login: record({ email: name, password: text, clientType: enumeration('desktop', 'web', 'mobile') }),
  Operation: record(op, retry),
  RevokeAll: record({ ...op, confirmation: confirm }, retry),
  UpdateProfile: record({ ...op, displayName: text }, retry),
  ChangePassword: record({ ...op, currentPassword: text, newPassword: text }, retry),
  VerifyEmail: record({ ...op, token: name }, retry),
  ResetRequest: record({ ...op, email: name }, retry),
  ResetConfirm: record({ ...op, token: name, newPassword: text }, retry),
  Pagination: record({}, { cursor: name, limit: integer(1, 100) }),
  CreateProject: record({ ...op, name }, retry),
  RenameProject: record({ ...op, name, expectedResourceRevision: name }, retry),
  BeginPublication: union(newPublication, updatePublication),
  CommitPublication: record({ ...op, manifestHash: hash }, retry),
  TrashResource: record({ ...op, scopeRevision: name, confirmation: confirm }, retry),
  RestoreResource: record({ ...op, expectedResourceRevision: name, confirmation: confirm }, retry),
  PurgeResource: record({ ...op, scopeRevision: name, confirmation: confirm, acknowledgePermanentLoss: confirm }, retry),
  DeleteAccount: record({ ...op, currentPassword: text, phrase: enumeration('ELIMINAR MI CUENTA'), scopeRevision: name }, retry),
  RecoverAccount: record({ ...op, confirmationText: enumeration('Recuperar mi cuenta') }, retry),
  ScopeQuery: record({ kind: enumeration('project', 'pattern', 'account'), id, action: enumeration('trash', 'restore', 'purge', 'delete-account') }),
  ResourceScope: record({kind,id,action:enumeration('trash','restore','purge'),scopeRevision:hash,resources:list(record({kind,id,name:text,state:name,revision:name})),versions:integer(0),files:integer(0),bytes:integer(0),blockers:list(record({kind,id,code:name}))}),
  OperationQuery: record({ operationType: name }),
  TimeQuery: record({ nonce: name }),
  AccountProfile: record({ id, email: name, verifiedAt: nullable(date), status: enumeration('pending_verification', 'active', 'deletion_pending'), usedBytes: integer(), reservedBytes: integer(), limitBytes: enumeration(2000000000) }, { displayName: text }),
  SessionView: record({ id, accountId: id, accessClass: enumeration('normal', 'verification', 'account_recovery'), startedAt: date, expiresAt: date }),
  ProjectView: project, PatternView: pattern, VersionView: version, FileView: file, TrashView: trash,
  PublicationStatus: union(record({kind:enumeration('active'),patternId:id,projectId:id,versionId:id}),record({kind:enumeration('trashed'),patternId:id}),record({kind:enumeration('deleted-confirmed'),patternId:id,operationId:id,confirmedAt:date})),
  ProjectPage: record({ items: list(project), nextCursor: nullable(text) }),
  PatternPage: record({ items: list(pattern), nextCursor: nullable(text) }),
  VersionPage: record({ items: list(version), nextCursor: nullable(text) }),
  FilePage: record({ items: list(file), nextCursor: nullable(text) }),
  TrashPage: record({ items: list(trash), nextCursor: nullable(text) }),
  Manifest: manifest,
  DeletionStatus: union(record({ requestId: id, state: enumeration('pending') }), record({ requestId: id, state: enumeration('deleted', 'cancelled'), confirmedAt: date, checkExpiresAt: date })),
  TimeView: record({ nonce: name, responseId: id, serverReceivedAt: date, serverSentAt: date }),
  Error: record({ code: name, message: text, traceId: id }, { operationId: id, fieldErrors: list(record({ field: text, code: name })),quota:record({usedBytes:integer(0),reservedBytes:integer(0),requestedBytes:integer(0),limitBytes:integer(0)}) }),
  MutationResult: union(record({ operationId: id, state: enumeration('pending') }), record({ operationId: id, state: enumeration('resolved'), outcome: enumeration('success', 'failure', 'no_change'), confirmedAt: date, data: jsonValue })),
  OperationView: union(
    record({ operationId: id, operationType: name, state: enumeration('pending'), authorizedResourceRefs: list(record({ kind: name, id })), actorLabel: text }),
    record({ operationId: id, operationType: name, state: enumeration('resolved'), outcome: enumeration('success', 'failure', 'no_change'), confirmedAt: date, authorizedResourceRefs: list(record({ kind: name, id })), actorLabel: text }, { code: name }),
  ),
  AccountDeletion: record({ status: name, requestedAt: date, expiresAt: date, operationId: id }),
  PublicationView: record({ publicationId: id, state: name, manifestHash: hash, files: list(record({ fileId: id, uploadState: name })), validationState: name, commitOperationId: nullable(id) }),
} as const;
export type DtoName = keyof typeof DTO;
export type HttpDto<N extends DtoName> = Value<(typeof DTO)[N]>;
export function parseRequest<N extends DtoName>(name: N, input: unknown): HttpDto<N> {
  return (DTO[name] as Contract<HttpDto<N>>).parse(input);
}
