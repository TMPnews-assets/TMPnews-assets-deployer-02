const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { glob } = require('glob');

// --- CONFIGURATION ---
// Updated to your new account and repo details
const GITHUB_USERNAME = "TMPnews-assets"; 
const REPO_NAME_PUBLIC = "TMPnews-assets-deployer-02"; // The repo to trigger
const REPO_NAME_PRIVATE = "TMPnews-assets-02";        // The storage repo
const TRIGGER_PAT = process.env.TRIGGER_PAT;

// Directory Setup
const RAW_DIR = path.join(__dirname, 'raw_images');
const PROCESSED_DIR = path.join(__dirname, 'already_optimize_image');
const PUBLIC_ROOT = path.join(__dirname, 'Public/TMP_news/images'); 

// URL Log File Setup
const URL_LOG_DIR = path.join(__dirname, 'optimized_image_url');
const URL_LOG_FILE = path.join(URL_LOG_DIR, 'optimized_image_url.txt');

// Date Setup
const date = new Date();
const year = date.getFullYear();
const month = date.toLocaleString('default', { month: 'long' });
const day = String(date.getDate()).padStart(2, '0');
const DEST_PATH = path.join(PUBLIC_ROOT, String(year), month, day);

// Helper: Run Shell Command
const runCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) console.warn(`Warning: ${error.message}`);
            resolve(stdout);
        });
    });
};

// --- MAIN FUNCTION ---
(async function main() {
    try {
        // 1. Ensure directories exist
        if (!fs.existsSync(DEST_PATH)) fs.mkdirSync(DEST_PATH, { recursive: true });
        if (!fs.existsSync(URL_LOG_DIR)) fs.mkdirSync(URL_LOG_DIR, { recursive: true });
        if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

        // 2. Find Images
        const pattern = 'raw_images/**/*.{jpg,jpeg,png,JPG,PNG,webp}'; 
        const files = await glob(pattern, { cwd: __dirname });

        if (files.length === 0) {
            console.log("❌ No new images found in 'raw_images'.");
            return;
        }

        console.log(`🔎 Found ${files.length} images. Processing for ${GITHUB_USERNAME}...`);

        let newUrls = []; 

        // 3. Process Each Image
        for (const fileRelPath of files) {
            const file = path.join(__dirname, fileRelPath);
            
            const statsBefore = fs.statSync(file);
            const sizeBeforeKB = (statsBefore.size / 1024).toFixed(2);

            // --- FILENAME CLEANING ---
            let filename = path.basename(file, path.extname(file));
            filename = filename.replace(/['"’`()%&?]/g, '');
            filename = filename.replace(/[\s_]+/g, '-');
            filename = filename.replace(/[^a-zA-Z0-9\-\.]/g, '');
            filename = filename.replace(/-+/g, '-');
            filename = filename.replace(/^-+|-+$/g, '');

            const webpFilename = `${filename}.webp`;
            const outputPath = path.join(DEST_PATH, webpFilename);

            console.log(`⚙️  Processing: ${path.basename(file)}`);
            
            // --- CONVERT & COMPRESS ---
            await runCommand(`cwebp -q 60 -m 6 -pass 10 -mt -resize 1280 0 "${file}" -o "${outputPath}"`);

            const statsAfter = fs.statSync(outputPath);
            const sizeAfterKB = (statsAfter.size / 1024).toFixed(2);
            const savings = ((1 - (statsAfter.size / statsBefore.size)) * 100).toFixed(1);

            console.log(`   ✅ Saved! 📉 ${sizeBeforeKB} KB -> ${sizeAfterKB} KB (${savings}%)`);

            // Move raw file to backup
            const backupPath = path.join(PROCESSED_DIR, path.basename(file));
            fs.renameSync(file, backupPath);

            // Generate URL
            const finalUrl = `https://assets.786313.xyz/TMP_news/images/${year}/${month}/${day}/${webpFilename}`;
            newUrls.push(finalUrl);
        }

        // 4. Update the Text File
        let fileContent = "";
        if (fs.existsSync(URL_LOG_FILE)) {
            fileContent = fs.readFileSync(URL_LOG_FILE, 'utf8');
        }
        
        const updatedContent = newUrls.join('\n\n') + '\n\n' + fileContent;
        fs.writeFileSync(URL_LOG_FILE, updatedContent);
        console.log("📝 Updated log file.");

        // 5. Git Push (To Private Repo: TMPnews-assets-02)
        console.log(`⬆️  Pushing to Private Storage (${REPO_NAME_PRIVATE})...`);
        await runCommand('git add .');
        await runCommand(`git commit -m "Auto-upload assets: ${newUrls.length} new images"`);
        await runCommand('git push origin main');

        // 6. Trigger GitHub Action (To Public Repo: TMPnews-assets-deployer-02)
        if (TRIGGER_PAT) {
            console.log(`🚀 Triggering Deployment on ${REPO_NAME_PUBLIC}...`);
            const triggerUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME_PUBLIC}/dispatches`;
            await runCommand(`curl -X POST -H "Accept: application/vnd.github.v3+json" -H "Authorization: token ${TRIGGER_PAT}" ${triggerUrl} -d '{"event_type":"deploy_assets"}'`);
            console.log("✅ Signal sent!");
        } else {
            console.log("⚠️  SKIPPING TRIGGER: TRIGGER_PAT not set.");
        }

        // 7. Final Output
        console.log("\n✨ NEW LINKS:");
        newUrls.forEach(url => console.log(`${url}\n`));

    } catch (e) {
        console.error("🔥 CRITICAL ERROR:", e);
    }
})();
