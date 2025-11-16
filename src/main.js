import { DriveApp } from './components/DriveApp.js';
import './styles.css';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  const driveApp = new DriveApp();
  app.appendChild(driveApp.render());
});

