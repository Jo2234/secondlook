# Error Codes

- Successful responses (100 - 399)
- Client error responses (400 - 499)
- Server error response (500 - 599)


| General Error Code | Description |
|  --- | --- |
| exceed_max_filesize | The input file size exceeds the maximum limit |
| invalid_parameter | The parameter value is invalid |
| error_download_image | There was an error downloading the source image |
| error_download_mask | There was an error downloading the mask image |
| error_decode_image | There was an error decoding the source image |
| error_decode_mask | There was an error decoding the mask image |
| error_download_video | There was an error downloading the source video |
| error_decode_video | There was an error decoding the source video |
| error_nsfw_content_detected | NSFW content was detected in the source image |
| error_no_face | No face was detected in the source image |
| error_pose | Failed to detect pose in the source image |
| error_face_parsing | Failed to perform face parsing on the source image |
| error_inference | An error occurred in the inference pipeline |
| exceed_nsfw_retry_limits | Retry limits exceeded to avoid generating NSFW image |
| error_upload | There was an error uploading the result image |
| error_multiple_people | Multiple people were detected in the source image |
| error_no_shoulder | Shoulders are not visible in the source image |
| error_large_face_angle | The face angle in the uploaded image is too large |
| error_hair_too_short | The input hair is too short |
| error_unexpected_video_duration | The video duration does not match the expected duration |
| error_bald_image | The input hairstyle is bald |
| error_unsupport_ratio | The aspect ratio of the input image is unsupported |
| unknown_internal_error | Other internal errors |