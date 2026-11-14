'use strict';

// Chargé avant tout le reste du tableau de bord : sans session, on passe directement à la connexion.
try {
  if (!localStorage.getItem('platform-sai-jeton')) window.location.replace('connexion.html');
} catch {
  window.location.replace('connexion.html');
}
