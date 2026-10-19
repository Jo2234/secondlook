import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
const target = document.getElementById('root');
if (!target) throw new Error('root missing');
createRoot(target).render(<App />);
