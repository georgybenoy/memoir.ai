import type { Metadata } from 'next';
import './globals.css';
import { SplashScreen } from '@/components/splash/splash-screen';
import { ThemeProvider } from '@/features/theme';

export const metadata: Metadata = {
  title: 'EduMentor — AI Study Companion',
  description:
    'Browser-local AI study companion that turns your notes into structured learning paths, guided recall, and spaced review.',
  authors: [{ name: 'EduMentor' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <script
          id="edumentor-theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('edumentor_theme')||'system';var r=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.setAttribute('data-theme',r);document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(r);document.documentElement.style.colorScheme=r;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-[var(--background)] text-[var(--text-primary)] antialiased font-sans">
        <ThemeProvider>
          <SplashScreen />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
