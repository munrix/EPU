import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The ngspice worker lazy-loads its engine, so worker bundles must support code splitting.
export default defineConfig({ plugins: [react()], worker: { format: 'es' } });
