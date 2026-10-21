import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduMentor — AI Study Companion',
  description:
    'Browser-local AI study companion that turns your notes into structured learning paths, guided recall, and spaced review.',
  authors: [{ name: 'EduMentor' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full dark`}>
      <body className="min-h-full bg-[var(--background)] text-[var(--text-primary)] antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
