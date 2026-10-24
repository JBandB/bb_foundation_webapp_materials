/*
 * De accounts van de wizard op de site. Een drempel, geen beveiliging: deze repo is openbaar, dus
 * dit bestand en de wizard zelf zijn voor iedereen te lezen. Daarom staat hier per account alleen
 * een gezouten hash van het wachtwoord (PBKDF2 met SHA-256), en als naam een code, nooit een naam of
 * een mailadres.
 *
 * Beheer met node ci/wizard-toegang.mjs. Zonder accounts vraagt de wizard niet om in te loggen. Zie
 * README.md, Inloggen.
 */
window.WIZARD_TOEGANG = {
  "versie": 1,
  "iteraties": 100000,
  "accounts": [
    { "naam": "jorik-01", "actief": true, "zout": "cHJ5cF110AG1xIUwtT3HSQ==", "hash": "3HwEDToivYZtqGJXS41vg6c+rrqZK3R3z8BMMstCoUg=" }
  ]
};
