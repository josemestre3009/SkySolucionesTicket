import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = { title: 'Sky Tickets', description: 'Mesa operativa de Sky Soluciones' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
