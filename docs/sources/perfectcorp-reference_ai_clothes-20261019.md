# AI Clothes Virtual Try-On

# Overview
AI Clothes is a virtual fitting room that lets users try on clothes without physically wearing them. Using AI and photo editing technology, these apps overlay outfits onto your image so you can see how different styles and fits look on your body type. It’s perfect for online shopping, style inspiration, or just playing around with fashion ideas. Try on clothes virtually with AI Clothes . Upload any clothing reference to swap outfits with you photo for an instant virtual wardrobe transformation.

---

## Integration Guide

* API Playground
You can use the API Playground to test the AI Clothes virtual try-on feature. This allows you to experiment with your ideas and gain a better understanding of the try-on process.

Access the API Playground at:
<https://yce.makeupar.com/api-console/en/api-playground/ai-clothes/>

---

* AI Clothes API Usage Guide

This guide explains how to upload images, prepare reference outfits, and create virtual try-on tasks using the AI Clothes API.

***

   * Step 1. Upload a File Using the File API

Use the **File API** (`/s2s/v2.0/file`) to upload a target user image.

**Image Requirements:**

*   Upload a high-resolution full-body photo.
*   Ensure the photo clearly shows the entire body.
*   Avoid backgrounds with multiple people or distracting objects.

**Example Request:**

```bash
curl --request POST \
  --url https://yce-api-01.makeupar.com/s2s/v2.0/file \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'content-type: application/json' \
  --data '{
    "files": [
 {
   "content_type": "image/jpg",
   "file_name": "full_body_photo_01_3dbd1b6683.jpg",
   "file_size": 547541
 }
    ]
  }'
```

***

   * Step 2. Retrieve File API Response

The response includes:

*   `file_id` for creating an AI task.
*   `requests.url` for uploading the actual image file.

**Sample Response:**

```json
{
  "status": 200,
  "data": {
    "files": [
 {
   "content_type": "image/jpg",
   "file_name": "full_body_photo_01_3dbd1b6683.jpg",
   "file_id": "SaGaqpDgKwFrVBgMpQMA3HY0LeqdT9/13W5TOD8/u/FfjK3xgCQ+hRt9MJXBFaud",
   "requests": [
 {
  "method": "PUT",
  "url": "https://yce-us.s3-accelerate.amazonaws.com/demo/ttl30/...signature...",
  "headers": {
    "Content-Length": "547541",
    "Content-Type": "image/jpg"
  }
 }
   ]
 }
    ]
  }
}
```

***

   * Step 3. Upload Image to Provided URL

Use the `requests.url` from the File API response to upload the image:

```bash
curl --location --request PUT 'https://yce-us.s3-accelerate.amazonaws.com/demo/ttl30/...signature...' \
  --header 'Content-Type: image/jpg' \
  --header 'Content-Length: 547541' \
  --data-binary @'./full_body_photo_01_3dbd1b6683.jpg'
```

***

   * Step 4. Prepare a Reference Outfit

 * 4.1 Upload a Reference Outfit Image

You can:

*   Upload an outfit image using the File API (`/s2s/v2.0/file`), or
*   Provide a valid image URL.

**Supported Outfit Images:**

*   Product image of the clothing.
*   Full-body photo as an outfit reference.

Refer to **[File Specs and Errors](#section/overview/File-Specs-and-Errors)** for detailed specifications.

***

   * Step 5. Create an AI Task

Use the **AI Task API** (`/s2s/v2.0/task/cloth-v4`) to create a virtual try-on task.

**Parameters:**

*   For the user image: `src_file_id` or `src_file_url`.
*   For the outfit image: `ref_file_id`, `ref_file_url`, or `template_id`.

**Example Request:**

```bash
curl --request POST \
  --url https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v4 \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'content-type: application/json' \
  --data '{
    "src_file_url": "https://plugins-media.makeupar.com/strapi/assets/clothes_03_cccd5d4803.jpeg",
    "ref_file_url": "https://plugins-media.makeupar.com/strapi/assets/clothes_reference_full_body_01_5a000d999f.png",
    "garment_category": "full_body"
  }'
```

**Sample Response:**

```json
{
  "status": 200,
  "data": {
    "task_id": "SaGaqpDgKwFrVBgMpQMA3HY0LeqdT9_13W5TOD8_u_GPi6NqQ3dhlmN-6ntFwhzT"
  }
}
```

***

   * Step 6. Poll for Task Result

Use the task ID to check the status:

```bash
curl --request GET \
  --url https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v4/<YOUR_TASK_ID> \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'content-type: application/json'
```

***

   * Step 7. Retrieve Result

A successful response includes a download URL for the result image:

```json
{
  "status": 200,
  "data": {
    "error": null,
    "results": {
 "url": "https://yce-us.s3-accelerate.amazonaws.com/demo/ttl30/...signature..."
    },
    "task_status": "success"
  }
}
```

Invalid API Key error response:

```json
{
  "status": 401,
  "error": "Unauthorized",
  "error_code": "InvalidAccessToken"
}
```

---

Use cases:
![](https://plugins-media.makeupar.com/smb/blog/post/2025-05-08/b80f4ae1-c905-4ec0-b491-e42c15e65575.gif)

![](https://bcw-media.s3.ap-northeast-1.amazonaws.com/strapi/assets/01%20ai%20clothes%20changer.jpg)

![](https://plugins-media.makeupar.com/smb/blog/post/2023-12-01/45f451aa-4b4f-466d-9da7-4538573c92af.jpg)

Suggestions for How to Shoot:
![Suggestions for How to Shoot](https://bcw-media.s3.ap-northeast-1.amazonaws.com/strapi/assets/AI-Cloth-Guideline.png "Suggestions for How to Shoot")


## File Specs & Errors
* Supported Formats & Dimensions

|Type|Supported Dimensions|Supported File Size|Supported Formats|
|  ---- | ---- | ---- | ---- |
|Target user image|1024×768 recommended, 512×384 minimum, max side 4096 px.</br></br> - Single person only.</br> - The person should occupy at least 80% of the frame for optimal results.</br> - Images should include the upper body only, from the chest upwards. There is no need to show the abdomen, but the shoulders should be visible.</br> - The face must be fully visible, with no obstructions.</br> - The body must be facing forward in a standing position (no sitting or crouching). |< 10MB|jpg/png|
|Reference image of the clothing |1024×768 recommended, 512×384 minimum, max side 4096 px.</br></br> - If Using a Real-Person Clothing Photo as Reference</br>&nbsp;&nbsp;&nbsp;- Must feature only one person.</br>&nbsp;&nbsp;&nbsp;- The visible clothing area must fully cover the intended try-on area.</br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Example: For full-body try-on, a half-body clothing image is not acceptable.</br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Example: For lower-body try-on, partial pants are not acceptable.</br>&nbsp;&nbsp;&nbsp;- The clothing must not be heavily obstructed (e.g. covered by long hair or arms).</br>&nbsp;&nbsp;&nbsp;- The face must be fully visible, with no obstructions.</br>&nbsp;&nbsp;&nbsp;- The body must be facing forward in a standing position (no sitting or crouching). </br></br> - If Using a Product Image as Reference</br>&nbsp;&nbsp;&nbsp;- Must be a front-facing product shot of a single garment.</br>&nbsp;&nbsp;&nbsp;- Do not use composite images (e.g. top and bottom in one photo).</br>&nbsp;&nbsp;&nbsp;- For the lower body, only actual worn outfits are supported, not standalone product images.|< 10MB|jpg/png|

* Error Codes

* Error code (Preprocess)

| Error code | Description |
| ---------- | ----------- |
| exceed_max_filesize | The SRC or REF image is too large. The long side must not exceed 4096 pixels. |
| error_below_min_image_size | The SRC or REF image is too small. The long side must be at least 128 pixels. |
| error_pose | The pose could not be detected from the uploaded human SRC image. |
| error_invalid_ref | The REF image is invalid, for example, it is empty or the subject is not fully visible. |
| error_apply_region_mismatch | The apply region in the SRC image does not match the REF image, so no edits can be applied. |
| error_invalid_src | When the source image shows only the lower body or only the feet. |

* Error code (Engine)

| Error code | Description |
| ---------- | ----------- |
| invalid_parameter | - Invalid garment category. <br> - Style_id is not in inference_style_list. <br> - Invalid src_keys, dst_keys, or acts. <br> - Invalid ref_keys or template_ref_image. <br> - Exactly one of them must be provided. |
| error_download_image | The SRC or REF image could not be downloaded. |
| exceed_max_filesize | The SRC or REF image is too large. The file size must not exceed 10 MB. |
| error_nsfw_content_detected | Potential NSFW content was detected in the result image. |
| error_editing_failed | The editing process failed because the result image is too similar to the source image. |
| unknown_internal_error | - Failed to load the model. <br> - Invalid scheduler algorithm type. <br> - No engine loaded. <br> - The file is not in the upload results. |
| error_multi_person | The system detected multiple individuals in the source or reference image under a "normal" or "strict" multi-person filter setting. |


* Environment & Dependency

| Sample Code Language / Tool | Recommended Runtime Versions |
|---|---|
| cURL | - bash >= 3.2</br>   - curl >= 7.58 (modern TLS/HTTP support)</br>   - jq >= 1.6 (robust JSON parsing) |
| Node.js (JavaScript) | Node >= 18 (for global fetch) |
| JavaScript | - Chrome / Edge >= 80</br>   - Firefox >= 74</br>   - Safari >= 13.1 |
| PHP | PHP >= 7.4 (for modern TLS/compat), ext-curl (recommended) or allow_url_fopen=On + ext-openssl, ext-json |
| Python | Python >= 3.10 (for f-strings), requests >= 2.20.0 |
| Java | Java 11+ (for HttpClient), Jackson Databind >= 2.12.0 |

---

## Unit Consumption

| AI Feature | Unit Consumed |
|---|---|
| AI Clothes Virtual Try-On V2.0 | 2 |
| AI Clothes Virtual Try-On V3.0 | 2 |

---


License: Privacy policy

## Servers

```
https://yce-api-01.makeupar.com
```

## Security

### BearerAuthenticationV2

[object Object]

Type: http
Scheme: bearer

## Download OpenAPI description

 - [AI Clothes Virtual Try-On](https://docs.perfectcorp.com/_bundle/reference/ai_clothes.yaml)

## V4.0

 - [POST /s2s/v2.0/task/cloth-v4](https://docs.perfectcorp.com/reference/ai_clothes/v4.0/paths/~1s2s~1v2.0~1task~1cloth-v4/post.md): AI tasks are asynchronous. Prefer webhook-based completion handling when the feature supports webhooks. Configure your webhook endpoint, verify webhook signatures, and use the received `task_id` to qu
 - [GET /s2s/v2.0/task/cloth-v4/{task_id}](https://docs.perfectcorp.com/reference/ai_clothes/v4.0/paths/~1s2s~1v2.0~1task~1cloth-v4~1%7Btask_id%7D/get.md)
## V3.0

 - [POST /s2s/v2.0/task/cloth-v3](https://docs.perfectcorp.com/reference/ai_clothes/v3.0/paths/~1s2s~1v2.0~1task~1cloth-v3/post.md): AI tasks are asynchronous. Prefer webhook-based completion handling when the feature supports webhooks. Configure your webhook endpoint, verify webhook signatures, and use the received `task_id` to qu
 - [GET /s2s/v2.0/task/cloth-v3/{task_id}](https://docs.perfectcorp.com/reference/ai_clothes/v3.0/paths/~1s2s~1v2.0~1task~1cloth-v3~1%7Btask_id%7D/get.md)
## V2.0

 - [GET /s2s/v2.0/task/template/cloth](https://docs.perfectcorp.com/reference/ai_clothes/v2.0/paths/~1s2s~1v2.0~1task~1template~1cloth/get.md)
 - [POST /s2s/v2.0/task/cloth](https://docs.perfectcorp.com/reference/ai_clothes/v2.0/paths/~1s2s~1v2.0~1task~1cloth/post.md): This endpoint initiates the clothing virtual try-on process. You can use a template ID or provide reference images (source and reference files). The task will be processed asynchronously, and you can
 - [GET /s2s/v2.0/task/cloth/{task_id}](https://docs.perfectcorp.com/reference/ai_clothes/v2.0/paths/~1s2s~1v2.0~1task~1cloth~1%7Btask_id%7D/get.md)
