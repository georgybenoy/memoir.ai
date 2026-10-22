import type { Metadata } from 'next';
import './globals.css';
import { SplashScreen } from '@/components/splash/splash-screen';

export const metadata: Metadata = {
  title: 'EduMentor — AI Study Companion',
  description:
    'Browser-local AI study companion that turns your notes into structured learning paths, guided recall, and spaced review.',
  authors: [{ name: 'EduMentor' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-[var(--background)] text-[var(--text-primary)] antialiased font-sans">
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
