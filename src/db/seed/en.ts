import type { MarketCatalog } from './types';

/** 英語圏向け汎用サンプルカタログ。 */
export const EN_CATALOG: MarketCatalog = {
  cafe: {
    baseCurrency: 'USD',
    categories: ['Coffee', 'Tea', 'Juice & Smoothie', 'Pastry', 'Snacks'],
    modifiers: [
      {
        name: 'Size',
        multiple: false,
        required: true,
        options: [
          { name: 'Small', delta: 0 },
          { name: 'Medium', delta: 50 },
          { name: 'Large', delta: 100 },
        ],
      },
      {
        name: 'Ice / Sugar',
        multiple: true,
        required: false,
        options: [
          { name: 'Less ice', delta: 0 },
          { name: 'No ice', delta: 0 },
          { name: 'Less sugar', delta: 0 },
          { name: 'No sugar', delta: 0 },
        ],
      },
      {
        name: 'Add-ons',
        multiple: true,
        required: false,
        options: [
          { name: 'Oat milk', delta: 75 },
          { name: 'Extra shot', delta: 100 },
        ],
      },
    ],
    products: [
      { name: 'House Drip Coffee', price: 325, cost: 90, cat: 0, mods: [0], fav: true },
      { name: 'Iced Americano', price: 375, cost: 100, cat: 0, mods: [0, 1], fav: true },
      { name: 'Cafe Latte', price: 450, cost: 140, cat: 0, mods: [0, 2], fav: true },
      { name: 'Cappuccino', price: 450, cost: 140, cat: 0, mods: [0, 2] },
      { name: 'Matcha Latte', price: 500, cost: 175, cat: 1, mods: [0, 2], fav: true },
      { name: 'Earl Grey Pot', price: 350, cost: 90, cat: 1 },
      { name: 'Fresh Orange Juice', price: 425, cost: 160, cat: 2, mods: [0] },
      { name: 'Mango Smoothie', price: 525, cost: 200, cat: 2, mods: [0] },
      { name: 'Butter Croissant', price: 375, cost: 140, cat: 3, stock: 24, fav: true },
      { name: 'Baked Cheesecake', price: 550, cost: 210, cat: 3, stock: 12 },
      { name: 'Egg Salad Sandwich', price: 675, cost: 250, cat: 4, stock: 4, minStock: 6 },
      { name: 'Sea Salt Fries', price: 400, cost: 120, cat: 4, stock: 30 },
    ],
    areas: ['Main Room', 'Patio'],
    tablesPerArea: [6, 4],
  },

  retail: {
    baseCurrency: 'USD',
    categories: ['Beverages', 'Snacks', 'Dairy & Chilled', 'Pantry', 'Household'],
    modifiers: [],
    products: [
      { name: 'Sparkling Water 500ml', price: 150, cost: 75, cat: 0, stock: 120, fav: true },
      { name: 'Bottled Green Tea', price: 225, cost: 120, cat: 0, stock: 80, fav: true },
      { name: 'Orange Juice 1L', price: 399, cost: 250, cat: 0, stock: 32 },
      { name: 'Potato Chips Sea Salt', price: 299, cost: 170, cat: 1, stock: 48, fav: true },
      { name: 'Milk Chocolate Bar', price: 250, cost: 140, cat: 1, stock: 60 },
      { name: 'Whole Milk 1 Gal', price: 450, cost: 310, cat: 2, stock: 3, minStock: 8, fav: true },
      { name: 'Free-Range Eggs 12ct', price: 499, cost: 340, cat: 2, stock: 4, minStock: 8 },
      { name: 'Greek Yogurt Cup', price: 199, cost: 115, cat: 2, stock: 24 },
      { name: 'Sourdough Loaf', price: 525, cost: 290, cat: 3, stock: 16 },
      { name: 'Jasmine Rice 2kg', price: 899, cost: 620, cat: 3, stock: 18 },
      { name: 'Dish Soap 500ml', price: 399, cost: 240, cat: 4, stock: 24 },
      { name: 'Paper Towels 6-Pack', price: 849, cost: 580, cat: 4, stock: 15 },
    ],
    areas: [],
    tablesPerArea: [],
  },

  restaurant: {
    baseCurrency: 'USD',
    categories: ['Appetisers', 'Mains', 'Pasta & Rice', 'Drinks'],
    modifiers: [
      {
        name: 'Portion',
        multiple: false,
        required: true,
        options: [
          { name: 'Regular', delta: 0 },
          { name: 'Large', delta: 300 },
        ],
      },
      {
        name: 'Dietary Notes',
        multiple: true,
        required: false,
        options: [
          { name: 'No onion', delta: 0 },
          { name: 'Extra spicy', delta: 0 },
          { name: 'Gluten-free option', delta: 150 },
        ],
      },
    ],
    products: [
      { name: 'Garden Salad', price: 750, cost: 250, cat: 0, fav: true },
      { name: 'Tomato Soup', price: 650, cost: 200, cat: 0 },
      { name: 'Grilled Herb Chicken', price: 1650, cost: 620, cat: 1, mods: [0, 1], fav: true },
      { name: 'Pan-Seared Salmon', price: 1950, cost: 820, cat: 1, mods: [1], fav: true },
      { name: 'Mushroom Risotto', price: 1450, cost: 490, cat: 2, mods: [0, 1] },
      { name: 'Classic Cheeseburger', price: 1350, cost: 510, cat: 1, mods: [1], fav: true },
      { name: 'Craft Lager Pint', price: 650, cost: 220, cat: 3, stock: 120 },
      { name: 'Iced Tea', price: 325, cost: 70, cat: 3 },
    ],
    areas: ['Main Hall', 'Bar Counter', 'Patio'],
    tablesPerArea: [8, 4, 4],
  },
};
