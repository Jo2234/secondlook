# Get feature cost

Check the unit consumption for each API. The values are consistent with those listed at https://yce.perfectcorp.com/ai-api/api-pricing.

Endpoint: GET /s2s/v2.0/credit/feature-cost
Security: BearerAuthenticationV2

## Security:

  - `BearerAuthenticationV2` (unknown)
    http bearer

## Query parameters:

  - `page_size` (integer)
    Number of results to return in a page. Default 20. value range: [1 - 20]

  - `starting_token` (string)
    Token for current page. Start with `null` for the first page, and use `next_token` from the previous response to start next page

## Response 200:

  - `200` (unknown)
    Successful retrieval of the feature cost by sku

## Response 200 fields (application/json):

  - `status` (integer)
    Response status
    Example: 200

  - `result` (object)

  - `result.next_token` (string)
    Token to query next page. `null` when there are no more pages.
    Example: MjA

  - `result.skus` (array)
    List of the skus

  - `result.skus.description` (string)
    Description of the sku
    Example: AI Skin Analysis for SD 1~4 concerns

  - `result.skus.amount` (number)
    Units consumed per `proc_unit`
    Example: 9

  - `result.skus.unit` (string)
    Measurement unit of the cost
    Enum: "result_image", "second"

  - `result.skus.proc_unit` (integer)
    Number of `unit`s included in one charge of `amount`
    Example: 1

  - `result.skus.run_task_url` (string)
    Full URL of the task endpoint that consumes this sku
    Example: https://yce-api-01.makeupar.com/s2s/v2.0/task/skin-analysis

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

