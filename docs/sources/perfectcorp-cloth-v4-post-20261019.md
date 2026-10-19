# Run an AI Cloth V4 task.

AI tasks are asynchronous. Prefer webhook-based completion handling when the feature supports webhooks. Configure your webhook endpoint, verify webhook signatures, and use the received `task_id` to query the task result after a `success` or `error` notification. See the [webhook integration guide](../develop/webhook.md) for setup and verification details.
If webhooks are not supported or cannot be used in your integration, implement polling. After submitting an AI task, poll the status endpoint at regular intervals (e.g., every 10 seconds) until the task status is `success` or `error`.

Endpoint: POST /s2s/v2.0/task/cloth-v4
Security: BearerAuthenticationV2

## Security:

  - `BearerAuthenticationV2` (unknown)
    http bearer

## Response 200:

  - `200` (unknown)
    Successful execution of the task

## Response 200 fields (application/json):

  - `status` (integer)
    Response status
    Example: 200

  - `data` (object)

  - `data.task_id` (string)
    ID of this task. Task result is valid to query by this ID for 24 hours.
    Example: grH0CvsgXuAIHLUzD0V1Ol34hoet3R1tvdbtiVHrDb6_UqCLKIejAIajwxrhOAfe

## Response 400:

  - `400` (unknown)
    Failed execution of task

## Response 400 fields (application/json):

  - `status` (integer)
    Response status
    Example: 400

  - `error` (string)
    Error message
    Example: The operation could not be completed

  - `error_code` (string)
    Error code:
* InvalidParameters - Invalid request parameters
* CreditInsufficiency - Insufficient unit to run
* BadRequest - Unexpected request parameter
* InvalidStyleGroup - Invalid style group id
* InvalidStyle - Invalid style id
    Enum: "InvalidParameters", "CreditInsufficiency", "InvalidStyleGroup", "InvalidStyle", "BadRequest"

## Response 401:

  - `401` (unknown)
    Invalid or missing API key

## Response 401 fields (application/json):

  - `status` (integer)
    Response status
    Example: 401

  - `error` (string)
    Example: Invalid API key

## Response 429:

  - `429` (unknown)
    Too many requests

## Response 429 fields (application/json):

  - `status` (integer)
    Response status
    Example: 429

  - `error` (string)
    Example: Too many requests

