# Get unit info

Display the available API units to two decimal places

Endpoint: GET /s2s/v1.0/client/credit
Security: BearerAuthentication

## Security:

  - `BearerAuthentication` (unknown)
    http bearer

## Response 200:

  - `200` (unknown)
    Successful retrieval of unit info

## Response 200 fields (application/json):

  - `status` (integer)
    Response status
    Example: 200

  - `results` (array)

  - `results.id` (integer)
    Unique identifier of this unit
    Example: 13105541279084536

  - `results.type` (string)
    Type of this unit
    Enum: "ApiSubsToken", "ApiPaygToken"

  - `results.amount` (integer)
    This paramenter is deprecated. Use amount_dec instead. Current unit balance.
    Example: 10

  - `results.amount_dec` (number)
    Remaining units displayed to two decimal places.
    Example: 10.04

  - `results.expiry` (integer)
    Unix timestamp of the expiry of this unit (ms)
    Example: 1704789135000

## Response 401:

  - `401` (unknown)
    Authentication failed or user does not have necessary permissions

