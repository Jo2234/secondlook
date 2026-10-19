import { z } from 'zod';
import { COPY } from './copy.js';

export const ModeSchema = z.enum(['fixture', 'live']);
export const IdSchema = z.string().regex(/^[0-9a-z]{20}$/);
export const IsoTimeSchema = z.iso.datetime();
export const GarmentCategorySchema = z.enum(['upper_body', 'outer', 'full_body', 'lower_body']);
export const PhotoTypeSchema = z.enum(['hanger', 'mannequin', 'flatlay', 'worn']);
export const PhotoRoleSchema = z.enum(['garment', 'model', 'buyer']);
export const CapabilityStatusSchema = z.enum(['documented', 'documented_unsupported', 'unverified', 'live_ok', 'live_failed']);
export const SeveritySchema = z.enum(['pass', 'warn', 'fail']);
export const UnitSchema = z.enum(['cm', 'in']);
export const QualityCheckIdSchema = z.enum(['format', 'file_size', 'min_dimensions', 'recommended_dimensions', 'max_dimensions_normalized', 'aspect_ratio', 'sharpness', 'exposure_mean', 'exposure_clipping', 'background_busy', 'decl_single_garment', 'decl_front_facing', 'decl_not_composite', 'decl_fully_visible', 'decl_no_people', 'capability', 'model_decl_single_person', 'model_decl_pose', 'model_rights']);
export const MeasurementFieldSchema = z.enum(['pit_to_pit', 'length', 'shoulder', 'sleeve', 'waist', 'hip', 'rise', 'inseam', 'leg_opening']);
const cu = z.number().int().nonnegative();
const dimension = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.enum(['seller_upload', 'rights_manifest', 'synthetic', 'buyer_upload']);
const keyEnum = <T extends Record<string, string>>(o: T) => z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);
export const StoredPhotoSchema = z.object({
  id: IdSchema, role: PhotoRoleSchema, mode: ModeSchema, source, rightsId: z.string().nullable(),
  original: z.object({ format: z.enum(['jpeg', 'png']), width: dimension, height: dimension, bytes: cu, sha256: hash }),
  normalized: z.object({ width: dimension, height: dimension, bytes: cu, sha256: hash, path: z.string() }),
  createdAt: IsoTimeSchema, expiresAt: IsoTimeSchema.nullable(),
}).refine(p => p.source !== 'rights_manifest' || !!p.rightsId, 'rightsId required');
export const CheckResultSchema = z.object({ id: QualityCheckIdSchema, severity: SeveritySchema, measured: z.union([z.number(), z.string(), z.null()]), threshold: z.string(), messageKey: keyEnum(COPY.quality), source: z.enum(['pixel', 'declaration', 'capability', 'doc_spec']) });
export const CapabilityRowSchema = z.object({ photoType: PhotoTypeSchema, category: GarmentCategorySchema, status: CapabilityStatusSchema, citation: z.string() });
export const QualityReportSchema = z.object({ photoId: IdSchema, role: PhotoRoleSchema, verdict: SeveritySchema, checks: z.array(CheckResultSchema), thresholdsVersion: z.string(), capability: CapabilityRowSchema.nullable(), spendAllowed: z.boolean() });
export const GarmentDeclarationSchema = z.object({ photoType: PhotoTypeSchema, category: GarmentCategorySchema, singleGarment: z.boolean(), frontFacing: z.boolean(), notComposite: z.boolean(), fullyVisible: z.boolean(), noPeopleInPhoto: z.boolean() });
export const MeasurementsSchema = z.object({ category: GarmentCategorySchema, valuesMm: z.partialRecord(MeasurementFieldSchema, z.union([z.number().int().min(50).max(2000), z.literal('na')])), enteredUnit: UnitSchema, tagSize: z.string().max(24).nullable() });
export const ListingSchema = z.object({ id: IdSchema, mode: ModeSchema, title: z.string().max(80), conditionNotes: z.string().max(500), priceText: z.string().max(20).nullable(), garmentPhotoIds: z.array(IdSchema), declaration: GarmentDeclarationSchema.nullable(), measurements: MeasurementsSchema.nullable(), tryOnResultIds: z.array(IdSchema), status: z.enum(['draft', 'ready']), createdAt: IsoTimeSchema, updatedAt: IsoTimeSchema });
export const GeneratedImageSchema = z.object({ id: IdSchema, listingId: IdSchema.nullable(), buyerSessionId: IdSchema.nullable(), jobId: IdSchema, mode: ModeSchema, disclosedPath: z.string(), width: dimension, height: dimension, label: z.enum(['ai_tryon_approximate', 'demo_fixture']), sha256: hash, artifactMissing: z.boolean(), createdAt: IsoTimeSchema, expiresAt: IsoTimeSchema.nullable() });
export const JobStateSchema = z.enum(['queued', 'uploading', 'submitting', 'polling', 'downloading', 'succeeded', 'failed', 'timed_out', 'uncertain', 'cancelled']);
export const UserErrorSchema = z.object({ code: z.string(), upstream: z.object({ http: z.number().int().nullable(), errorCode: z.string().nullable(), engineError: z.string().nullable() }).nullable(), retryable: z.enum(['no', 'user_confirm']), messageKey: keyEnum(COPY.errors) });
export const TryOnAttemptSchema = z.object({ n: z.number().int().positive(), state: JobStateSchema, taskId: z.string().nullable(), srcFileId: z.string().nullable(), refFileId: z.string().nullable(), postCount: cu.max(3), getCount: cu, uploadsStartedAt: IsoTimeSchema.nullable(), postSendStartedAt: IsoTimeSchema.nullable(), attemptDeadlineAt: IsoTimeSchema.nullable(), submittedAt: IsoTimeSchema.nullable(), deadlineAt: IsoTimeSchema.nullable(), error: UserErrorSchema.nullable(), ledgerEntryId: IdSchema.nullable(), history: z.array(z.object({ at: IsoTimeSchema, from: JobStateSchema, to: JobStateSchema, reason: z.string() })) });
export const TryOnJobSchema = z.object({ id: IdSchema, mode: ModeSchema, listingId: IdSchema.nullable(), buyerSessionId: IdSchema.nullable(), garmentPhotoId: IdSchema, modelPhotoId: IdSchema, category: GarmentCategorySchema, request: z.object({ garment_category: GarmentCategorySchema, change_shoes: z.literal(false), filter_multi_person: z.literal('strict') }), attempts: z.array(TryOnAttemptSchema).min(1), resultImageId: IdSchema.nullable(), createdAt: IsoTimeSchema, requestId: z.uuidv4() });
export const PreflightRecordSchema = z.object({ at: IsoTimeSchema, baseUrl: z.string(), fenceSeq: cu, featureCost: z.object({ matched: z.array(z.object({ description: z.string(), amount: z.number(), unit: z.string(), proc_unit: z.number(), run_task_url: z.string() })), costPerTaskCu: cu.nullable(), status: z.enum(['ok', 'cost_unknown', 'cost_ambiguous', 'cost_invalid']) }), balanceCu: cu.nullable(), ok: z.boolean(), problems: z.array(z.string()) });
export const LedgerEntrySchema = z.object({ id: IdSchema, jobId: IdSchema, attempt: z.number().int().positive(), mode: ModeSchema, cu, state: z.enum(['reserved', 'spent', 'released', 'possibly_spent']), at: IsoTimeSchema, createdSeq: cu, settledAt: IsoTimeSchema.nullable(), settledSeq: cu.nullable(), reason: z.string() });
export const ArtifactRecoverySchema = z.object({ id: IdSchema, jobId: IdSchema, attempt: z.number().int().positive(), at: IsoTimeSchema, outcome: z.enum(['recovered', 'failed', 'expired']), requestCount: cu.max(2) });
export const DeletionReceiptSchema = z.object({ sessionId: IdSchema, deletedAt: IsoTimeSchema, deletedLocal: z.array(z.object({ kind: z.enum(['buyer_photo', 'generated_image', 'job_record_media_refs']), id: IdSchema, sha256: hash })), retainedByVendor: z.object({ fileIds: z.array(z.string()), taskIds: z.array(z.string()), statement: z.string(), source: z.string() }) });
export const HealthResponseSchema = z.object({ mode: ModeSchema, version: z.string(), thresholdsVersion: z.string(), buyerUpload: z.enum(['disabled', 'enabled']), preflight: PreflightRecordSchema.nullable(), capabilities: z.array(CapabilityRowSchema) });
export const InvalidRequestResponseSchema = z.object({ mode: ModeSchema, error: z.literal('invalid_request'), issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })) });
export const PhotoUploadResponseSchema = z.object({ mode: ModeSchema, photo: StoredPhotoSchema, quality: QualityReportSchema.nullable() });
export const EvaluatePhotoRequestSchema = z.object({ declaration: GarmentDeclarationSchema });
export const ModelOptionSchema = z.object({ photoId: IdSchema, label: z.string(), rightsId: z.string().nullable(), source, synthetic: z.boolean() });
export const ModelsResponseSchema = z.object({ mode: ModeSchema, models: z.array(ModelOptionSchema) });
export const ListingReadinessSchema = z.object({ ready: z.boolean(), missing: z.array(z.string()) });
export const ListingResponseSchema = ListingSchema.extend({ readiness: ListingReadinessSchema });
export const ListingWriteRequestSchema = ListingSchema.pick({ title: true, conditionNotes: true, priceText: true, garmentPhotoIds: true, declaration: true, measurements: true });
export const ListingPatchRequestSchema = ListingWriteRequestSchema.partial();
export const UnitsResponseSchema = z.object({ mode: ModeSchema, preflight: PreflightRecordSchema.nullable(), budgetCu: cu, ledger: z.array(LedgerEntrySchema), committedCu: cu, remainingBudgetCu: cu, balanceEstimateCu: z.number().int().nullable() });
export const TryOnRequestSchema = z.object({ requestId: z.uuidv4(), garmentPhotoId: IdSchema, modelPhotoIds: z.array(IdSchema).min(1).max(2), confirmCostCu: cu });
export const RetryRequestSchema = z.object({ requestId: z.uuidv4(), confirmCostCu: cu });
export const JobsResponseSchema = z.object({ mode: ModeSchema, jobs: z.array(TryOnJobSchema) });
export const BuyerSessionRequestSchema = z.object({ consentVersion: z.string(), consentAccepted: z.literal(true), adultConfirmed: z.literal(true), isSelfConfirmed: z.literal(true) });
export const BuyerSessionResponseSchema = z.object({ mode: ModeSchema, sessionId: IdSchema, expiresAt: IsoTimeSchema });
export const BuyerTryOnRequestSchema = RetryRequestSchema.extend({ listingId: IdSchema });
