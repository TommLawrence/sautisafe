# How to access the competition datasets on HuggingFace

This guide is for anyone who needs to download the speech datasets provided by
the competition organisers (Intron Health). You do not need any coding
experience. Just follow the steps one by one.

---

## What you need before you start

- A free HuggingFace account. If you do not have one, go to
  https://huggingface.co/join and sign up with your email.
- The names of the datasets. The competition uses these:
  - `intronhealth/afrivox-transcribe` (transcription audio + text)
  - `intronhealth/AfriSwitch` (code-switched audio + text)
  - `intronhealth/afrivox-translate` (translation audio + text)
  - `intronhealth/afrispeech-200` (a public dataset, no access request needed)

Some of these are "gated." Gated means the dataset owner (Intron Health) must
approve you before you can download the files. This is normal for datasets
with real human recordings. You request access, they approve, then you
download.

---

## Step 1: Log in to HuggingFace

Go to https://huggingface.co and log in with your account.

---

## Step 2: Go to the dataset page

Open each dataset page in your browser. Replace the name with the one you
want:

- https://huggingface.co/datasets/intronhealth/afrivox-transcribe
- https://huggingface.co/datasets/intronhealth/AfriSwitch
- https://huggingface.co/datasets/intronhealth/afrivox-translate
- https://huggingface.co/datasets/intronhealth/afrispeech-200 (this one is
  public, no request needed)

---

## Step 3: Request access (for gated datasets only)

When you open a gated dataset page, you will see a box near the top that says
something like "You need to agree to share your contact information to access
this dataset." Inside that box:

1. Read the short text. It explains how the data was collected and what you
   can and cannot do with it.
2. There is usually a checkbox that says you agree to the terms. Tick it.
3. Fill in your name, email, and a short reason for why you want access
   (for example: "I am a participant in the AI for Global Health
   Benchmarking competition and I need the dataset to benchmark my speech
   model").
4. Click the button that says **Request access** or **Agree and access**.

That is it. You have submitted your request.

---

## Step 4: Wait for approval

After you request access, the status changes to **PENDING**. This means the
dataset owner has your request and will review it.

- Approval can take a few hours or a few days. Be patient.
- You do not need to do anything else. You will get an email when you are
   approved.
- You can check your request status anytime at
   https://huggingface.co/settings/gated. This page lists every gated
   dataset you have requested, with the status next to each one
   (PENDING, ACCEPTED, or REJECTED).

Once the status changes to **ACCEPTED**, you can download the files.

---

## Step 5: Download the files (after approval)

Once you are approved, go back to the dataset page. You will now see the file
list. There are two ways to download:

### Option A: Download through the browser (simplest)

1. On the dataset page, click the **Files and versions** tab.
2. You will see a list of files and folders.
3. Click any file to download it. For folders, click into the folder to see
   the files inside, then download each one.

### Option B: Download with a script (if you are comfortable with the
command line)

1. Create an access token:
   - Go to https://huggingface.co/settings/tokens
   - Click **New token**
   - Name it (for example: "dataset download")
   - Type: **Fine-grained**
   - Under "Datasets," tick **Read access to contents of all public datasets**
     and **Read access to contents of all gated datasets**
   - Click **Create**
   - Copy the token. It starts with `hf_`.

2. Open your terminal and run this (replace `YOUR_TOKEN` with your token, and
   `DATASET_NAME` with the dataset name, for example
   `intronhealth/AfriSwitch`):

   ```bash
   # Download a single file
   curl -L -H "Authorization: Bearer YOUR_TOKEN" \
     "https://huggingface.co/datasets/DATASET_NAME/resolve/main/FILENAME" \
     -o filename

   # Or use the huggingface CLI (install it first: pip install huggingface_hub)
   huggingface-cli download DATASET_NAME --repo-type dataset --token YOUR_TOKEN
   ```

---

## Quick reference: the datasets and their status

| Dataset | Type | Access |
|---------|------|--------|
| `intronhealth/afrispeech-200` | Transcription | Public (no request needed) |
| `intronhealth/afrivox-transcribe` | Transcription | Gated (request access) |
| `intronhealth/AfriSwitch` | Code-switched | Gated (request access) |
| `intronhealth/afrivox-translate` | Translation | Gated (request access) |

---

## Common problems

**"Access to dataset is restricted" when I try to download.**
You are either not logged in, or your access request is still pending. Go to
https://huggingface.co/settings/gated to check your status.

**My request was rejected.**
This is rare. Re-read the terms on the dataset page and submit a new request
with a clearer reason. If you are a competition participant, say so in the
reason field.

**I was approved but still cannot download.**
Make sure you are logged in to the same HuggingFace account you used to
request access. If you are using the command line, make sure your token is
correct and has "Read access to gated datasets" enabled.

**The file is too big to download in my browser.**
Use the command-line method in Step 5, Option B. The `huggingface-cli
download` command handles large files automatically.

---

## Need help?

If you are stuck, ask in the competition WhatsApp group. Someone who has
already been through the process can help.
