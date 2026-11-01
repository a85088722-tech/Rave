/**
 * Configuration de Duo 2.0.
 * Ne JAMAIS mettre ici une clé secrète (Supabase service_role / secret, clé secrète LiveKit) :
 * ce fichier est lisible par n'importe qui dans le navigateur.
 */
export const CONFIG = {
  // true  = aperçu sans serveur (comptes simulés), utilisé pour les artefacts
  // false = vraie app : comptes et invitations sur Supabase
  DEMO: false,

  // Supabase — URL du projet + clé publique (publishable). Ces deux valeurs peuvent être publiques.
  SUPABASE_URL: 'https://koyzafermyzpsnerxzpb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_vGWE4aGpwEIIDFuD-JYW6g_4lir1tJn',

  // LiveKit — adresse wss://… de ton projet LiveKit Cloud (les jetons viennent de la fonction serveur)
  LIVEKIT_URL: 'wss://duo-qcjql3j3.livekit.cloud',

  // Recherche YouTube — clé API limitée à ton domaine dans Google Cloud (facultatif)
  YOUTUBE_API_KEY: 'AIzaSyB1IT8muEgl1UIl8lo-8RMdF0zO-jHFSpU',

  // Notifications push — clé PUBLIQUE VAPID (la clé privée va dans les secrets Supabase)
  VAPID_PUBLIC_KEY: 'BICY4K2SFwxsbjWMlhbDf1Mlg-_0kG2jOd98B0QCyNF7rkvqe1bYTwn0P5bKDPSLsxtBGL2eTlnndGYwd66ios8',

  APP_VERSION: '2.0.1'
};
