const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

// On "mock" (simule) la base de données
jest.mock('../config/db');

describe('API Commandes (/api/orders)', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/orders', () => {
        it('devrait ignorer les faux prix du Frontend et recalculer le total sécurisé', async () => {
            
            // 1. On prépare un panier "piraté" envoyé par le client
            const maliciousPayload = {
                customer_name: "Hacker",
                customer_phone: "770000000",
                customer_address: "Dakar (Livraison)", // Frais de livraison attendus : 2000
                payment_method: "cash",
                total_amount: 10, // Le hacker tente de payer 10 FCFA
                items: [
                    { id: 1, quantity: 2, price: 5 } // Faux prix unitaire de 5 FCFA
                ]
            };

            // 2. On configure la séquence exacte des requêtes SQL simulées
            db.query
                .mockResolvedValueOnce({}) // 1er appel : BEGIN
                .mockResolvedValueOnce({ rows: [{ base_price: '1500' }] }) // 2ème appel : SELECT base_price (Vrai prix = 1500)
                .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // 3ème appel : INSERT INTO orders (On simule l'ID 99)
                .mockResolvedValueOnce({}) // 4ème appel : INSERT INTO order_items
                .mockResolvedValueOnce({}); // 5ème appel : COMMIT

            // 3. On exécute la requête HTTP
            const response = await request(app)
                .post('/api/orders')
                .send(maliciousPayload);

            // 4. Assertions de la réponse
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('orderId', 99);
            
            // 5. L'ASSERTION CRITIQUE : On vérifie ce qui a été inséré dans la base
            // L'appel n°3 correspond à la requête d'insertion de la commande :
            // db.query('INSERT INTO orders...', [name, phone, address, total_amount, method])
            const insertOrderCallArgs = db.query.mock.calls[2][1]; 
            
            // Calcul attendu par le serveur : 
            // (2 unités * 1500 vrai prix) + 2000 frais de port Dakar = 5000 FCFA
            const secureTotalCalculated = insertOrderCallArgs[3]; 

            expect(secureTotalCalculated).toBe(5000); 
            expect(secureTotalCalculated).not.toBe(10); // Vérifie que le faux prix n'est pas utilisé
        });
    });
});