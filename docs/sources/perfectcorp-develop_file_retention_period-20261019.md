# File Retention Period

Uploaded files and their associated `file_id` values are stored for **30 days**. After an AI task is created, the corresponding `task_id` remains valid for **30 days**. After processing is completed, the `task_id` may be used to retrieve a download URL, which is valid for **2 hours**. All uploaded and generated images and videos are automatically removed after **30 days**.

> **Warning:** If the file is not downloaded via the response-provided link within **2 hours** after successful processing, it will no longer be accessible. If the file is not downloaded within that period, use the `task_id` to obtain a new download link.