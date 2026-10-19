import type { UserError } from '../shared/types.js';
type Mapping = Pick<UserError, 'code' | 'messageKey' | 'retryable'>;
const m = (code: string, messageKey: UserError['messageKey'], retryable: UserError['retryable'] = 'user_confirm'): Mapping => ({ code, messageKey, retryable });
export const ENGINE_ERRORS: Readonly<Record<string, Mapping>> = {
  error_pose: m('yc_error_pose', 'pose'), error_invalid_src: m('yc_invalid_src', 'source'), error_invalid_ref: m('yc_invalid_ref', 'reference'), error_apply_region_mismatch: m('yc_region_mismatch', 'region'),
  error_multi_person: m('yc_multi_person', 'people'), error_multiple_people: m('yc_multi_person', 'people'),
  exceed_max_filesize: m('yc_size', 'size', 'no'), error_exceed_max_image_size: m('yc_size', 'size', 'no'), error_below_min_image_size: m('yc_size', 'size', 'no'),
  error_download_image: m('yc_io', 'retry'), error_decode_image: m('yc_io', 'retry'), error_upload: m('yc_io', 'retry'),
  error_no_face: m('yc_face_or_shoulder', 'face'), error_face_parsing: m('yc_face_or_shoulder', 'face'), error_large_face_angle: m('yc_face_or_shoulder', 'face'), error_no_shoulder: m('yc_face_or_shoulder', 'face'),
  error_nsfw_content_detected: m('yc_declined', 'declined', 'no'), exceed_nsfw_retry_limits: m('yc_declined', 'declined', 'no'), error_editing_failed: m('yc_no_change', 'noChange'),
  error_inference: m('yc_engine', 'generic'), unknown_internal_error: m('yc_engine', 'generic'), invalid_parameter: m('yc_engine', 'generic'),
};
export function mapError(input: { http?: number; errorCode?: string; engineError?: string }): UserError {
  const { http, errorCode, engineError } = input;
  let result: Mapping;
  if (engineError) result = ENGINE_ERRORS[engineError] ?? m('yc_engine', 'generic');
  else if (http === 401) result = m('auth', 'key', 'no');
  else if (http === 429) result = m('rate_limited', 'wait');
  else if (errorCode === 'CreditInsufficiency') result = m('no_units', 'units', 'no');
  else if (errorCode && ['InvalidParameters', 'BadRequest', 'InvalidStyleGroup', 'InvalidStyle'].includes(errorCode)) result = m('bad_request', 'bug', 'no');
  else if (errorCode === 'InvalidTaskId') result = m('task_missing', 'retry');
  else if (errorCode === 'TaskTimeout') result = m('deadline', 'later');
  else result = m('yc_engine', 'generic');
  return { ...result, upstream: { http: http ?? null, errorCode: errorCode ?? null, engineError: engineError ?? null } };
}
