const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

// 1. On "mock" (simule) notre connexion à PostgreSQL
jest.mock('../config/db');

describe('API Produits (/api/products)', () => {
    
    // Avant chaque test, on nettoie les faux appels à la BDD
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/products', () => {
        it('devrait retourner une liste paginée de produits (Code 200)', async () => {
            
            // 2. On configure ce que la base de données doit renvoyer
            // Le contrôleur fait 2 requêtes : les produits, puis le COUNT(*)
            db.query
                .mockResolvedValueOnce({
                    rows: [
                        { id: 1, name: 'iPhone 15 Pro', base_price: 1200, category_name: 'tech', variants: [] }
                    ]
                })
                .mockResolvedValueOnce({
                    rows: [{ count: '1' }]
                });

            // 3. On simule la requête HTTP avec Supertest
            const response = await request(app).get('/api/products');

            // 4. On écrit nos assertions (ce qu'on attend comme résultat)
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('products');
            expect(response.body.products).toHaveLength(1);
            expect(response.body.products[0].name).toBe('iPhone 15 Pro');
            expect(response.body.totalItems).toBe(1);
            
            // On vérifie que la BDD a bien été sollicitée 2 fois
            expect(db.query).toHaveBeenCalledTimes(2);
        });

        it('devrait gérer les erreurs de la base de données de manière propre (Code 500)', async () => {
            // On force la BDD à renvoyer une erreur
            db.query.mockRejectedValue(new Error('Erreur BDD simulée'));

            const response = await request(app).get('/api/products');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /api/products', () => {
        it('devrait interdire la création de produit sans token (Code 401/403)', async () => {
            const newProduct = { name: 'AirPods', base_price: 200, category_id: 1 };
            const response = await request(app).post('/api/products').send(newProduct);
            
            // Comme on n'envoie pas de JWT dans les headers, on s'attend à être bloqué
            expect(response.status).toBe(401); 
        });
    });
});