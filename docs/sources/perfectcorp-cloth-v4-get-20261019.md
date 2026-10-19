# Check the status of a AI Cloth V4 task.

Endpoint: GET /s2s/v2.0/task/cloth-v4/{task_id}
Security: BearerAuthenticationV2

## Security:

  - `BearerAuthenticationV2` (unknown)
    http bearer

## Path parameters:

  - `task_id` (string, required)
    ID of task to check

## Response 200:

  - `200` (unknown)
    Successful check of the task status

## Response 200 fields (application/json):

  - `url` (string)
    URL to download this result. Valid for 2 hours
    Example: https://example.com/sample-result-url

## Response 400:

  - `400` (unknown)
    Invalid task ID

## Response 400 fields (application/json):

  - `status` (integer)
    Response status
    Example: 400

  - `error` (string)
    Example: Invalid task ID

## Response 401:

  - `401` (unknown)
    Invalid or missing API key

## Response 401 fields (application/json):

  - `status` (integer)
    Response status
    Example: 401

  - `error` (string)
    Example: Invalid API key

## Response 500:

  - `500` (unknown)
    Task execution timeout

## Response 500 fields (application/json):

  - `status` (integer)
    Response status
    Example: 500

  - `error` (string)
    Example: Task execution timed out

