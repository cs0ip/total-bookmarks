import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializeLocale } from './i18n';
import { initializeSettings } from './settings';

const target = document.getElementById('app');
if (!target) throw new Error('Application root element not found');

void Promise.all([initializeLocale(), initializeSettings()]).then(() => mount(App, { target }));
