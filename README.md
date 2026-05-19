# Candidate Evaluation Tool

A web-based recruiter tool powered by Claude. Recruiters upload a resume and job description, answer five structured interview prompts, and receive a formatted candidate evaluation they can download as a Word document.

---

## Deploy to Render (No Coding Required)

### Step 1 — Put the files on GitHub

1. Go to [github.com](https://github.com) and sign in (or create a free account).
2. Click the **+** icon → **New repository**.
3. Name it `candidate-evaluation-tool`, set it to **Private**, click **Create repository**.
4. On the next screen, click **uploading an existing file**.
5. Upload these files, maintaining the folder structure:
   ```
   package.json
   server.js
   public/
     index.html
   ```
6. Click **Commit changes**.

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) and sign in (or create a free account).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account if prompted, then select the `candidate-evaluation-tool` repository.
4. Fill in the settings:
   - **Name:** candidate-evaluation-tool (or anything you like)
   - **Region:** pick the closest to you
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (fine for low-to-moderate usage)
5. Click **Advanced** → **Add Environment Variable**:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key (get it from [console.anthropic.com](https://console.anthropic.com))
6. Click **Create Web Service**.

Render will build and deploy the app. After 2–3 minutes you'll get a URL like:
`https://candidate-evaluation-tool.onrender.com`

Share that URL with your recruiters — that's all they need.

---

## Getting Your Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys** in the left sidebar
4. Click **Create Key**, give it a name, copy the key
5. Paste it as the `ANTHROPIC_API_KEY` environment variable in Render

**Note:** API usage is billed per use. Each evaluation costs roughly $0.01–0.03 depending on document length.

---

## Usage

1. Open the tool URL in any browser
2. Upload the candidate's resume (PDF or Word)
3. Upload the job description (PDF or Word)
4. Enter the candidate's name and position title
5. Answer the five interview prompts
6. Click **Generate Evaluation**
7. Review the structured evaluation on screen
8. Click **Download Word Doc** to save

---

## Updating the Tool

To make changes (e.g. add a question, adjust the output format):
1. Edit the relevant file locally
2. Upload the updated file to GitHub (drag and drop on the repository page)
3. Render will automatically redeploy within a minute or two

---

## Notes

- Files up to 10MB are supported
- The tool does not store any candidate data — everything is processed in memory and discarded
- The free Render tier may have a ~30 second cold start if the service hasn't been used recently
