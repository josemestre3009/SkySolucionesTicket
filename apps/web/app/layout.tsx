import type { Metadata, Viewport } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Sky Tickets',
  description: 'Mesa operativa de Sky Soluciones',
  manifest: '/manifest.webmanifest',
  icons: { icon: ['/icon.svg', '/icon-192.png'], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Sky Tickets' },
};

export const viewport: Viewport = { themeColor: '#111827' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
