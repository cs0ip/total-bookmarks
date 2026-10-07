import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializeLocale } from './i18n';

const target = document.getElementById('app');
if (!target) throw new Error('Application root element not found');

void initializeLocale().then(() => mount(App, { target }));
