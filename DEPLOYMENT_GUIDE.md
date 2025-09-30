# 🚀 Deployment & Repository Guide

## 📁 What Files Should Be in Your Repo?

### ✅ **INCLUDE These Files:**

```
📦 Millennium Redesign (NEXT JS)
├── pages/              # All Next.js pages
├── components/         # React components
├── hooks/              # Custom hooks
├── lib/                # Utility functions
├── styles/             # CSS files
├── types/              # TypeScript types
├── public/             # Static assets
│   ├── Assets/        # Images, icons, SVGs
│   ├── manifest.json  # PWA manifest
│   ├── robots.txt     # SEO
│   └── sw.js          # Service worker
├── package.json        # Dependencies
├── package-lock.json   # Lock file
├── tsconfig.json       # TypeScript config
├── next.config.js      # Next.js config
├── .eslintrc.json      # Linting rules
├── .gitignore          # Git ignore rules
├── .env.example        # Environment template
├── README.md           # Documentation
└── OPTIMIZATIONS.md    # Optimization notes
```

### ❌ **EXCLUDE These (Already in .gitignore):**

```
# Build outputs
.next/                  # Next.js build
out/                    # Export output
build/                  # Build artifacts

# Dependencies
node_modules/           # NPM packages

# Environment files (SENSITIVE!)
.env
.env.local
.env.production.local

# IDE files
.vscode/
.idea/

# OS files
.DS_Store

# Logs
*.log

# Vercel
.vercel
```

---

## 🔧 Setup Instructions

### **1. Initial Repository Setup**

```bash
# Navigate to your project
cd "/Users/ryan/Downloads/Code/Millennium Redesign (NEXT JS)"

# Initialize git (if not already done)
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Optimized Millennium Portal"

# Create GitHub repository and push
git remote add origin https://github.com/YOUR_USERNAME/millennium-redesign.git
git branch -M main
git push -u origin main
```

### **2. Environment Variables Setup**

Create `.env.local` file (NOT in repo):

```bash
# Generate a secure secret
openssl rand -base64 32

# Add to .env.local
SESSION_SECRET=your_generated_secret_here
NODE_ENV=development
```

### **3. Install Dependencies**

```bash
npm install
```

### **4. Test Locally**

```bash
# Development mode
npm run dev

# Production build test
npm run build
npm start
```

---

## 🌐 Vercel Deployment

### **Step 1: Push to GitHub**
```bash
git add .
git commit -m "Ready for deployment"
git push
```

### **Step 2: Import to Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Select "Millennium Redesign (NEXT JS)"

### **Step 3: Configure Environment Variables**

In Vercel project settings, add:

```
SESSION_SECRET = [your-secret-from-openssl-rand]
NODE_ENV = production
```

**⚠️ IMPORTANT**: 
- SESSION_SECRET must be at least 32 characters
- Never commit this to GitHub
- Generate with: `openssl rand -base64 32`

### **Step 4: Deploy**

Vercel will automatically:
- Install dependencies
- Run `npm run build`
- Deploy to production

---

## 🔍 Troubleshooting

### **Build Fails on Vercel**

1. **Check build logs** in Vercel dashboard
2. **Common issues:**
   ```bash
   # Missing environment variable
   → Add SESSION_SECRET in Vercel settings
   
   # TypeScript errors
   → Run `npm run build` locally first
   
   # Dependency issues
   → Delete node_modules and package-lock.json
   → Run `npm install` again
   ```

### **Login Still Not Working**

The latest code handles axios redirects properly. If still failing:

1. **Check Vercel logs** for errors
2. **Verify credentials** are correct
3. **Test locally** with `npm run dev`
4. **Check network tab** in browser DevTools

### **Missing Files After Deployment**

Ensure these are committed:
```bash
git status                    # Check what's tracked
git add pages/ components/    # Add if missing
git commit -m "Add missing files"
git push
```

---

## 📋 Pre-Deployment Checklist

- [ ] `.env.local` created with SESSION_SECRET
- [ ] `npm run build` succeeds locally
- [ ] Login tested locally
- [ ] All files committed to git
- [ ] `.gitignore` properly configured
- [ ] Sensitive data removed from code
- [ ] Environment variables documented
- [ ] README updated

---

## 🎯 Post-Deployment

### **Verify Deployment**

1. Visit your Vercel URL
2. Test login functionality
3. Check all pages load correctly
4. Test keyboard shortcuts (Cmd+K, etc.)
5. Verify responsive design on mobile

### **Custom Domain (Optional)**

In Vercel:
1. Go to Project Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

### **Monitor Performance**

Vercel provides:
- Analytics dashboard
- Real User Monitoring
- Error tracking
- Performance insights

---

## 🔄 Making Updates

```bash
# Make changes to code
# ...

# Test locally
npm run dev

# Build to verify
npm run build

# Commit changes
git add .
git commit -m "Description of changes"
git push

# Vercel auto-deploys on push to main
```

---

## 🆘 Need Help?

### **Common Commands**

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check for errors
npm run lint

# View git status
git status

# View last commits
git log --oneline -10
```

### **Important Files to Know**

- `next.config.js` - Next.js configuration
- `package.json` - Dependencies and scripts
- `.env.local` - Local environment variables (NOT in repo)
- `.env.example` - Template for environment variables (IN repo)
- `.gitignore` - Files to exclude from git

---

## 🎉 You're All Set!

Your Millennium Portal redesign is now:
- ✅ Optimized for performance
- ✅ Production-ready
- ✅ Securely configured
- ✅ Ready for Vercel deployment

**Questions?** Check OPTIMIZATIONS.md for technical details!
