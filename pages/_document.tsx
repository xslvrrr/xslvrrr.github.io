import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Preconnect to Google Fonts for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Optimized font loading with display=swap */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        
        {/* Preload critical assets */}
        <link rel="preload" href="/Assets/Millennium Logo 2.png" as="image" />
        
        {/* PWA Support */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#050505" />
        
        {/* Favicon */}
        <link rel="icon" href="/Assets/Millennium Logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/Assets/Millennium Logo.png" />
        
        {/* SEO Meta Tags */}
        <meta name="description" content="Modern, fast, and intuitive redesign of the Millennium Portal for students" />
        <meta name="keywords" content="millennium, portal, student, education, school" />
        <meta name="author" content="Millennium Portal Team" />
        
        {/* Open Graph / Social Media */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Millennium Portal - Modern Student Portal" />
        <meta property="og:description" content="A modern, fast, and intuitive student portal experience" />
        
        {/* Performance Hints */}
        <link rel="dns-prefetch" href="https://millennium.education" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
