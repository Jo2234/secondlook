# Create a new file.

To upload a new file, you'll first need to use the File API. It will give you a URL – use that URL to upload your file. Once the upload is finished, you can use the file_id from the same response to start using our AI features.

Endpoint: POST /s2s/v2.0/file
Security: BearerAuthenticationV2

## Security:

  - `BearerAuthenticationV2` (unknown)
    http bearer

## Request fields (application/json):

  - `files` (array, required)

  - `files.content_type` (string, required)
    Specifies the file's content MIME type. Supported values currently include image and video formats, such as image/jpg and video/mp4.
    Example: image/jpg

  - `files.file_name` (string, required)
    Name of this file
    Example: my-selfie.jpg

  - `files.file_size` (integer, required)
    File size in bytes. Supported limits are 10 MB for image files and 100 MB for video files.
    Example: 50000

## Response 200:

  - `200` (unknown)
    Successful retrieval of file upload information

## Response 200 fields (application/json):

  - `files` (array)

  - `files.content_type` (string)
    Content MIME type for this file.
    Example: image/jpg

  - `files.file_name` (string)
    Name of this file
    Example: my-selfie.jpg

  - `files.file_id` (string)
    ID of this file. Other run task API will need this `file_id`.
    Example: U8aqJbsXGT537jtGnEDFHqxdDXqh8+oTF/cSkLimzuvVwMP+Jb1XbjPsf7ZgUgLY

  - `files.requests` (array)
    Using upload `url`, `headers`, `method` below to upload file. After completion, the `file_id` is used to proceed with calling run task API.

  - `files.requests.headers` (object)
    Headers to include when uploading the file
    Example: {"Content-Type":"image/jpg","Content-Length":50000}

  - `files.requests.url` (string)
    URL to upload this file
    Example: https://example.com/presigned-upload-url

  - `files.requests.method` (string)
    HTTP method to upload this file
    Example: PUT

## Response 400:

  - `400` (unknown)
    Invalid request parameters

## Response 400 fields (application/json):

  - `status` (integer)
    Response status
    Example: 400

  - `error` (string)
    Example: Invalid parameter value

  - `error_code` (string)
    Example: InvalidParameters

## Response 401:

  - `401` (unknown)
    Invalid or missing API key

## Response 401 fields (application/json):

  - `status` (integer)
    Response status
    Example: 401

  - `error` (string)
    Example: Invalid API key

