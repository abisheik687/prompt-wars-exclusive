# Firebase deployment handoff

The code and GitHub Actions workflow are ready. These account-bound steps must be completed in the Firebase and GitHub accounts that will own production, because they create cloud resources and secrets.

1. In [Firebase Console](https://console.firebase.google.com/), create or select the Firebase project for Clausewise and copy its **Project ID** from Project settings.
2. Enable the Gemini API for that Google Cloud project and create a restricted API key for server-side use.
3. Create a deploy service account with permissions to deploy Firebase Hosting, Cloud Functions, and Secret Manager secrets. Download its JSON key only through your secure account session.
4. In the GitHub repository, go to **Settings → Secrets and variables → Actions** and add:
   - `FIREBASE_PROJECT_ID`: the Firebase project ID
   - `FIREBASE_SERVICE_ACCOUNT`: entire service-account JSON file content
   - `GEMINI_API_KEY`: restricted Gemini API key
5. Run the **Deploy Clausewise to Firebase** GitHub Action from the Actions tab, or push a small documentation change to `main`.
6. When it succeeds, copy the `https://PROJECT_ID.web.app` URL into the README’s Google services section and record the prototype walkthrough there.

Do not place any of these values in a source file, `.env.example`, issue, pull request, or video.
