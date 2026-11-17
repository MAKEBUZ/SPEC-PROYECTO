import type { ReactNode } from 'react';
import type { Metadata,Viewport } from 'next';
import { PwaRegistration } from '../components/pwa-registration.js';
import { DeletionLifecycle } from '../components/deletion-lifecycle.js';
import './account.css';
export const metadata:Metadata={title:'Patronaje',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Patronaje',statusBarStyle:'default'},icons:{apple:'/icons/icon-192.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#075985'};
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="es"><body><PwaRegistration/><DeletionLifecycle/>{children}</body></html>; }
