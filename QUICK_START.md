# ⚡ Quick Start Guide

## 🎯 What You Need to Do Now

### **1. Fix Login (Already Done!)**
The login code has been updated to properly handle axios redirects. The issue was that axios throws an error on 302 redirects when `maxRedirects: 0`, so we catch it and use the response.

### **2. Test Login Locally**

```bash
# Start dev server
npm run dev

# Open browser to http://localhost:3000
# Click login and test with your credentials
```

**If login fails:**
- Check console for error messages
- Verify your credentials are correct
- Check if millennium.education is accessible

---

## 📁 Files in Your Repo - Simple Answer

### ✅ **COMMIT THESE:**
```
Everything EXCEPT:
- node_modules/
- .next/
- .env.local
- .DS_Store
- *.log
```

### ❌ **NEVER COMMIT:**
```
.env.local          ← Contains SESSION_SECRET (sensitive!)
node_modules/       ← Too large, installed via npm
.next/              ← Build output, regenerated
```

---

## 🚀 Deploy to Vercel - 4 Steps

### **Step 1: Create .env.local**
```bash
# Generate secret
openssl rand -base64 32

# Create file .env.local with:
SESSION_SECRET=your_generated_secret_here
```

### **Step 2: Push to GitHub**
```bash
git add .
git commit -m "Ready for deployment"
git push
```

### **Step 3: Import to Vercel**
1. Go to vercel.com
2. Click "New Project"
3. Import your repo
4. Add environment variable: `SESSION_SECRET` = [your secret]

### **Step 4: Deploy**
Click "Deploy" - done! 🎉

---

## 🔧 Common Commands

```bash
# Development
npm run dev        # Start local server

# Build
npm run build      # Test production build

# Git
git status         # See what's changed
git add .          # Stage all changes
git commit -m ""   # Commit with message
git push           # Push to GitHub
```

---

## 📋 New Files Added (All Good to Commit)

- `/.eslintrc.json` - Linting configuration
- `/DEPLOYMENT_GUIDE.md` - Full deployment instructions
- `/OPTIMIZATIONS.md` - Technical details
- `/QUICK_START.md` - This file
- `/public/manifest.json` - PWA configuration
- `/public/robots.txt` - SEO
- `/public/sw.js` - Service worker (optional)
- `.env.example` - Environment template (safe)

**Note:** `.env.local` is NOT in the list because it's secret!

---

## 🐛 If Something Breaks

1. **Build fails:**
   ```bash
   rm -rf .next node_modules
   npm install
   npm run build
   ```

2. **Login fails:**
   - Check browser console
   - Check Vercel function logs
   - Verify SESSION_SECRET is set

3. **Git issues:**
   ```bash
   git status    # See what's wrong
   git diff      # See changes
   ```

---

## ✅ You're Ready When:

- [ ] `npm run dev` works locally
- [ ] Login works on localhost
- [ ] `npm run build` succeeds
- [ ] Files committed to git
- [ ] Pushed to GitHub
- [ ] Environment variables ready

**Then deploy to Vercel!**

---

Need detailed instructions? See **DEPLOYMENT_GUIDE.md**
