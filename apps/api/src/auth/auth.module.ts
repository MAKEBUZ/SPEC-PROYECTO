import { Module } from '@nestjs/common';
import {maintenanceFor} from '../storage/maintenance-gate.js';
import {createBackupRuntime,type BackupRuntimeOptions} from '../storage/backup-runtime.js';
import type { DynamicModule } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { TokensService } from './tokens.service.js';
import type { TokenServices } from './tokens.service.js';
import { OutboxQueue, OutboxWorker } from '../mail/outbox.worker.js';
import type { MailTransport } from '../mail/mail-transport.js';
import { SessionService } from './session.service.js';
import { ProfileController } from '../account/profile.controller.js';
import { CsrfGuard } from './csrf.guard.js';
import { DeletionService } from '../account/deletion.service.js';
import type { AccountContent } from '../account/deletion.service.js';
import { DeletionCheckService } from '../account/deletion-check.service.js';
import { DeletionController } from '../account/deletion.controller.js';
import type { CredentialResolver } from '../http/access.js';
import { ProjectsController } from '../projects/projects.controller.js';
import { ProjectsService } from '../projects/projects.service.js';
import { StagingService } from '../publications/staging.service.js';
import { PublicationsController } from '../publications/publications.controller.js';
import type { BlobStore } from '../storage/blob-store.js';
import { CommitService } from '../publications/commit.service.js';
import { ArtifactWorker } from '../publications/artifact-worker.js';
import { PublicationJobs } from '../publications/publication-jobs.js';
import type { RenderAssets } from '../../../../packages/print/src/profile.js';
import {PurgeWorker,type PurgeJournal} from '../trash/purge.worker.js';
import {PurgeService,PurgeJobs} from '../trash/purge.service.js';
import {ResourcePurgeMetadata} from '../trash/resource-purge.js';
import {AccountPurgeContent,AccountPurgeMetadata,AccountPurgeJobs} from '../account/account-purge.worker.js';
type PublicationServices={blobStore?:BlobStore;renderAssets?:RenderAssets;artifactRunner?:URL;suppressionLog?:PurgeJournal;backup?:Omit<BackupRuntimeOptions,'pool'>};
import { OperationsService,OperationsController } from '../operations/operations.controller.js';
import { LibraryService,LibraryController } from '../library/library.controller.js';
import { DownloadService,DownloadController } from '../files/download.controller.js';
import { TimeController } from '../time/time.controller.js';
import { TrashService } from '../trash/trash.service.js';
import { TrashController } from '../trash/trash.controller.js';

@Module({})
export class AuthModule {
  // No default mail sink or dummy database: composition must supply the durable
  // delivery adapter (T020), corpus-backed passwords and operation HMAC key.
  static register(services: TokenServices & PublicationServices & { publicOrigin?: string; accountContent?: AccountContent }): DynamicModule {
    if(!services.accountContent&&services.blobStore&&services.suppressionLog)services={...services,accountContent:new AccountPurgeContent()};
    return { module: AuthModule, controllers: [AuthController, ProfileController, ProjectsController, OperationsController,LibraryController,TimeController,TrashController,...(services.blobStore?[PublicationsController,DownloadController]:[]),...(services.accountContent ? [DeletionController] : [])], providers: [
      {provide:'PATRON_MAINTENANCE',useValue:maintenanceFor(services.pool)},
      ...(services.backup?[{provide:'PATRON_BACKUP_RUNTIME',useFactory:()=>{const runtime=createBackupRuntime({...services.backup!,pool:services.pool});return {...runtime,onModuleInit:()=>runtime.scheduler.start(),onModuleDestroy:()=>runtime.scheduler.stop()};}}]:[]),
      {provide:TrashService,inject:[SessionService],useFactory:(sessions:SessionService)=>new TrashService(services.pool,sessions,services.operationKey,services.operationKeyVersion)},
      ...(services.blobStore&&services.suppressionLog?[
        {provide:PurgeService,inject:[SessionService,TrashService],useFactory:(sessions:SessionService,trash:TrashService)=>new PurgeService(services.pool,sessions,trash,services.suppressionLog!,services.operationKey,services.operationKeyVersion)},
        {provide:PurgeJobs,inject:[PurgeService],useFactory:(admission:PurgeService)=>new PurgeJobs(services.pool,new PurgeWorker(services.pool,services.blobStore!,services.suppressionLog!,new ResourcePurgeMetadata()),admission)},
      ]:[]),
      {provide:LibraryService,inject:[SessionService],useFactory:(sessions:SessionService)=>new LibraryService(services.pool,sessions,services.operationKey)},
      ...(services.blobStore?[{provide:DownloadService,inject:[SessionService,LibraryService],useFactory:(sessions:SessionService,library:LibraryService)=>new DownloadService(services.pool,sessions,library,services.blobStore!)}]:[]),
      {provide:OperationsService,inject:[SessionService],useFactory:(sessions:SessionService)=>new OperationsService(services.pool,sessions)},
      ...(services.blobStore?[{provide:StagingService,inject:[SessionService],useFactory:(sessions:SessionService)=>new StagingService(services.pool,sessions,services.blobStore!,services.operationKey,services.operationKeyVersion)}]:[]),
      ...(services.blobStore?[{provide:CommitService,inject:[SessionService],useFactory:(sessions:SessionService)=>new CommitService(services.pool,sessions,services.operationKey,services.operationKeyVersion)}]:[]),
      ...(services.blobStore&&services.renderAssets?[
        {provide:ArtifactWorker,useFactory:()=>new ArtifactWorker(services.pool,services.blobStore!,services.renderAssets!,services.artifactRunner)},
        {provide:PublicationJobs,inject:[ArtifactWorker,CommitService,StagingService],useFactory:(artifacts:ArtifactWorker,commits:CommitService,staging:StagingService)=>new PublicationJobs(artifacts,commits,staging)},
      ]:[]),
      { provide: ProjectsService, inject:[SessionService], useFactory:(sessions:SessionService)=>new ProjectsService(services.pool,sessions,services.operationKey,services.operationKeyVersion) },
      { provide: TokensService, useFactory: () => new TokensService(services) },
      { provide: SessionService, useFactory: () => new SessionService(services) },
      { provide: CsrfGuard, useFactory: () => new CsrfGuard(services.operationKey, services.publicOrigin) },
      { provide: 'PATRON_CSRF_GUARD', useExisting: CsrfGuard },
      { provide: DeletionCheckService, useFactory: () => new DeletionCheckService(services.pool) },
      { provide: 'PATRON_CREDENTIAL_RESOLVER', inject: [SessionService, DeletionCheckService], useFactory: (sessions: SessionService, checks: DeletionCheckService): CredentialResolver => context => Reflect.getMetadata('patronaje:route', context.getHandler()) === 'deletionStatus' ? checks.resolve(context) : sessions.resolve(context) },
      ...(services.accountContent ? [
        { provide: DeletionService, inject: [SessionService, DeletionCheckService], useFactory: (sessions: SessionService, checks: DeletionCheckService) => new DeletionService(services, sessions, checks, services.accountContent!) },
        { provide: 'PATRON_ACCOUNT_LIFECYCLE_JOBS', useExisting: DeletionService },
      ] : []),
      ...(services.accountContent instanceof AccountPurgeContent&&services.blobStore&&services.suppressionLog?[
        {provide:AccountPurgeJobs,inject:[DeletionService],useFactory:(deletion:DeletionService)=>new AccountPurgeJobs(services.pool,deletion,new PurgeWorker(services.pool,services.blobStore!,services.suppressionLog!,new AccountPurgeMetadata(services.accountContent as AccountPurgeContent,(c,id)=>deletion.confirmPurged(c,id))))},
      ]:[]),
    ], exports: [TokensService, SessionService, 'PATRON_CREDENTIAL_RESOLVER', 'PATRON_CSRF_GUARD', ...(services.accountContent ? [DeletionService, 'PATRON_ACCOUNT_LIFECYCLE_JOBS'] : [])] };
  }
  static withOutbox(services: Omit<TokenServices, 'delivery'> & PublicationServices & {
    outboxKeyId: string; outboxKeys: ReadonlyMap<string, Buffer>; mailTransport: MailTransport; publicOrigin: string; accountContent?: AccountContent;blobStore?:BlobStore;
  }): DynamicModule {
    const module = this.register({ ...services, delivery: new OutboxQueue(services.outboxKeyId, services.outboxKeys) });
    return { ...module, providers: [...module.providers!, {
      provide: 'PATRON_OUTBOX_WORKER', useFactory: () => new OutboxWorker(services.pool, services.outboxKeys, services.mailTransport, services.publicOrigin),
    }], exports: [...module.exports!, 'PATRON_OUTBOX_WORKER'] };
  }
}
