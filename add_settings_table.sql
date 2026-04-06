-- Création de la table pour les réglages globaux du site
CREATE TABLE IF NOT EXISTS public.site_settings (
    id integer PRIMARY KEY DEFAULT 1,
    store_name varchar(100) DEFAULT 'BoustaneTech Store',
    contact_phone varchar(20) DEFAULT '221774133645',
    contact_email varchar(150) DEFAULT 'contact@boustantech.com',
    contact_address text DEFAULT 'Pikine Saf Bar, Dakar',
    maps_link text DEFAULT 'https://maps.app.goo.gl/tUo6M6r6uXyS1JbZ8',
    whatsapp_number varchar(20) DEFAULT '221774133645',
    facebook_link text DEFAULT 'https://facebook.com/boustantech',
    instagram_link text DEFAULT 'https://instagram.com/boustantech',
    tiktok_link text DEFAULT 'https://tiktok.com/@boustantech',
    maintenance_mode boolean DEFAULT false,
    delivery_cost_dakar integer DEFAULT 2000,
    delivery_cost_suburbs integer DEFAULT 3000,
    delivery_cost_regions integer DEFAULT 5000,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT one_row_only CHECK (id = 1)
);

-- Insertion des données initiales (si elle n'existe pas déjà)
INSERT INTO public.site_settings (id) 
VALUES (1) 
ON CONFLICT (id) DO NOTHING;
