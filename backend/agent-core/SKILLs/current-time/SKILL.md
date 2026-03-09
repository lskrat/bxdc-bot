---
name: current-time
description: A utility skill for checking the current official timestamp from a remote time endpoint and returning a human-readable time.
metadata:
  category: utility
  triggers:
    - 当前时间
    - 现在几点
    - 时间戳
    - current time
    - timestamp
    - checktime
  endpoint: https://vv.video.qq.com/checktime?otype=json
  author: local
  version: "1.0.0"
---

Use this skill when the user asks for the current time, current timestamp,
or asks you to verify time from the remote endpoint.

Behavior:
- Use the `api_caller` tool to send a `GET` request to `https://vv.video.qq.com/checktime?otype=json`.
- The tool input should be a JSON string with:
  - `url`: `https://vv.video.qq.com/checktime?otype=json`
  - `method`: `GET`
  - `headers`: `{}`
  - `body`: `""`
- The response is not pure JSON. It looks like `QZOutputJson={...};`.
- Extract the `t` field from the payload. It is a Unix timestamp in seconds.
- Convert the timestamp into a readable date-time before replying.
- Clearly state both:
  - the original timestamp
  - the converted readable time
- Do not invent the time. If the API call or parsing fails, explain the failure briefly and include the raw response if helpful.
