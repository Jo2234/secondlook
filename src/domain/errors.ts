import type { UserError } from '../shared/types.js';
type Mapping = Pick<UserError, 'code' | 'messageKey' | 'retryable'>;
const m = (code: string, messageKey: UserError['messageKey'], retryable: UserError['retryable'] = 'user_confirm'): Mapping => ({ code, messageKey, retryable });
export const ENGINE_ERRORS: Readonly<Record<string, Mapping>> = {
  error_pose: m('yc_error_pose', 'pose'), error_invalid_src: m('yc_invalid_src', 'source'), error_invalid_ref: m('yc_invalid_ref', 'reference'), error_apply_region_mismatch: m('yc_region_mismatch', 'region'),
  error_multi_person: m('yc_multi_person', 'people'), error_multiple_people: m('yc_multi_person', 'people'),
  exceed_max_filesize: m('yc_size', 'size', 'no'), error_exceed_max_image_size: m('yc_size', 'size', 'no'), error_below_min_image_size: m('yc_size', 'size', 'no'),
  error_download_image: m('yc_io', 'retry'), error_decode_image: m('yc_io', 'retry'), error_download_mask: m('yc_io', 'retry'), error_decode_mask: m('yc_io', 'retry'), error_upload: m('yc_io', 'retry'),
  error_no_face: m('yc_face_or_shoulder', 'face'), error_face_parsing: m('yc_face_or_shoulder', 'face'), error_large_face_angle: m('yc_face_or_shoulder', 'face'), error_no_shoulder: m('yc_face_or_shoulder', 'face'),
  error_nsfw_content_detected: m('yc_declined', 'declined', 'no'), exceed_nsfw_retry_limits: m('yc_declined', 'declined', 'no'), error_editing_failed: m('yc_no_change', 'noChange'),
  error_unsupport_ratio: m('yc_ratio', 'ratio'),
  error_download_video: m('yc_engine', 'generic'), error_decode_video: m('yc_engine', 'generic'), error_hair_too_short: m('yc_engine', 'generic'), error_unexpected_video_duration: m('yc_engine', 'generic'), error_bald_image: m('yc_engine', 'generic'),
  error_inference: m('yc_engine', 'generic'), unknown_internal_error: m('yc_engine', 'generic'), invalid_parameter: m('yc_engine', 'generic'),
};
export const HTTP_ERRORS: Readonly<Record<string, Mapping>> = {
  CreditInsufficiency: m('no_units', 'units', 'no'),
  InvalidParameters: m('bad_request', 'bug', 'no'), BadRequest: m('bad_request', 'bug', 'no'),
  InvalidStyleGroup: m('bad_request', 'bug', 'no'), InvalidStyle: m('bad_request', 'bug', 'no'),
  InvalidAccessToken: m('auth', 'key', 'no'), InvalidTaskId: m('task_missing', 'retry'), TaskTimeout: m('deadline', 'later'),
};
const ownMapping = (table: Readonly<Record<string, Mapping>>, code: string): Mapping | undefined => Object.hasOwn(table, code) ? table[code] : undefined;
export function mapError(input: { http?: number; errorCode?: string; engineError?: string }): UserError {
  const { http, errorCode, engineError } = input;
  // A received unauthorized status dominates any body, including an engine error.
  const result = http === 401 ? m('auth', 'key', 'no')
    : engineError ? ownMapping(ENGINE_ERRORS, engineError) ?? m('yc_engine', 'generic')
    : http === 429 ? m('rate_limited', 'wait')
    : errorCode ? ownMapping(HTTP_ERRORS, errorCode) ?? m('yc_engine', 'generic')
    : m('yc_engine', 'generic');
  return { ...result, upstream: { http: http ?? null, errorCode: errorCode ?? null, engineError: engineError ?? null } };
}
