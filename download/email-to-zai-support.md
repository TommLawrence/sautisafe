Subject: Published project returns "Sorry, there was a problem deploying the code" - needs help

Hi Z.ai team,

I'm building a Next.js 16 project in the Zcloud workspace (project: SautiSafe, a code-switched voice reporting tool for industrial safety). The dev server runs fine on port 3000 - all routes return 200, the production build (`bun run build`) compiles successfully, and the standalone server (`.next/standalone/server.js`) serves correctly when I test it locally on port 3001.

However, when I publish the project and open the published link (https://a1ft37j9uav1-d.space-z.ai/), it returns:

  "Sorry, there was a problem deploying the code. You can return to the generation page to try again."

This happens on both desktop and mobile, in different tabs. I've tried re-publishing multiple times after fixing the build (the standalone output now copies the db/ and .env into .next/standalone/ with a relative DATABASE_URL path), but the error persists.

Could you check what's failing in the publish/deploy step? The build itself succeeds - the issue seems to be in the publishing infrastructure, not the code. Happy to share the build logs or any other details you need.

Thanks,
L'ence
