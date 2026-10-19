# Rate Limit

To ensure fair usage and prevent abuse, our API implements rate limiting. There are two types of rate limits:

- ### Per IP Address
Each IP address is limited to a maximum of 250 requests per 300 seconds. Exceeding this limit will result in a 429 Too Many Requests error.
Recommended pacing: ~5 requests per second (5 QPS) to avoid latency spikes.
- ### Per Access Token
Each access token is limited to a maximum of 250 requests per 300 seconds. Exceeding this limit will result in a 429 Too Many Requests error.
Recommended pacing: ~5 requests per second (5 QPS) to avoid latency spikes.


Both conditions must be met for a request to be accepted. If either condition is not met, the request will receive a `429 Too Many Requests` error. Please note that each query related to unit will be processed real-time. Other APIs can use the access token util expired.

It is recommended that you handle rate limit errors gracefully in your application by implementing the appropriate backoff and retry mechanisms.