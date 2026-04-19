# 🍵 Mommy Bán Trà Sữa - AI Chatbot Order Management System

> An intelligent AI-powered chatbot system for automating milk tea shop orders on Telegram

## Project Overview

This project implements an AI-powered chatbot that operates as a virtual shop assistant for a milk tea (trà sữa) shop. The bot communicates with customers on Telegram, helps them place orders, calculates prices, and facilitates payment through VietQR and PayOS integration.

### Key Features

- **AI-Powered Conversation**: Uses OpenAI (GPT-4 mini) to understand customer messages and generate natural responses
- **Telegram Integration**: Full Telegram bot support with polling-based message handling
- **Smart Order Management**: 
  - Parse customer orders from natural language
  - Ask for missing information (size preferences)
  - Confirm order details before payment
  - Calculate totals automatically
- **Payment Integration**: 
  - VietQR QR code generation for bank transfers
  - PayOS integration for payment verification (optional)
  - Order confirmation on payment completion
- **Menu Management**: CSV-based menu with categories, prices, and availability
- **Order Tracking**: In-memory state management for customer conversations
- **Comprehensive Testing**: Unit tests for order flow and AI integration

## Architecture

```
src/
├── app.js                          # Express server & Telegram bot init
├── cli.js                          # CLI interface for testing
├── services/
│   ├── ai.service.js              # OpenAI integration for order parsing
│   ├── chat.service.js            # Reply generation with persona
│   ├── menu.service.js            # Menu loading & caching
│   ├── order.service.js           # Core order flow logic
│   ├── order.store.js             # Order state storage
│   ├── payos.service.js           # PayOS payment integration
│   └── telegram.service.js        # Telegram bot setup & handlers
├── routes/
│   └── payos.webhook.route.js     # Webhook for payment confirmation
├── utils/
│   ├── csv.util.js                # CSV reading utility
│   ├── prompt.util.js             # Persona loading
│   └── save_orders.util.js        # Order persistence
├── prompt/
│   └── persona.txt                # AI personality definition
├── public/
│   └── script.js           
│   └── index.html          
│   └── style.css
└── Menu.csv                       # Menu database
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key (provided by the company)
- Telegram Bot Token (from @BotFather)
- (Optional) PayOS credentials

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Mommy-ban-tra-sua

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### Environment Variables

```env
# Telegram Configuration
BOT_TOKEN=your_telegram_bot_token

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Bank Account (for VietQR)
ACCOUNT=0999999999

# PayOS Integration (Optional)
PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key
APP_URL=https://your-domain.com
PAYOS_RETURN_URL=https://your-domain.com/payos/return
PAYOS_CANCEL_URL=https://your-domain.com/payos/cancel

# Server Configuration
PORT=4300
```

## Usage

### Run Telegram Bot
```bash
npm start
```
Bot will start polling Telegram for messages and be ready to serve customers.

### CLI Testing Mode
```bash
npm run start:cli
```
Interact with the bot directly in the terminal (great for development/testing).

### Run Tests
```bash
# Run order tests
npm test

# Run AI integration tests
npm run test:ai

# Run all tests
npm run test:all
```

## 💬 How It Works

### Customer Conversation Flow

```
Step 1: Customer sends order
   Input: "2 trà sữa trân châu đen size L"
   
Step 2: AI parses order
   - Extracts: 2x Trà sữa trân châu đen, Size L
   - Validates against menu
   
Step 3: Bot asks for missing info (if needed)
   - If size not specified: "size M hay L nè con?"
   
Step 4: Customer confirms order
   - Input: "ok" or "xác nhận"
   - Bot displays: Order summary + Total price
   
Step 5: Payment
   - Input: "thanh toán" or "chuyển khoản"
   - Bot generates VietQR code
   - Displays bank info & transfer content
   
Step 6: Order completion
   - After payment confirmation
   - Bot ready for new order
```

### Menu Structure

The menu is stored in `Menu.csv` with the following structure:

| Category | Item ID | Name | Description | Price M | Price L | Available |
|----------|---------|------|-------------|---------|---------|-----------|
| Trà Sữa | TS01 | Trà Sữa Trân Châu Đen | ... | 35000 | 45000 | true |

Categories include:
- **Trà Sữa** - Milk Tea
- **Trà Trái Cây** - Fruit Tea  
- **Cà Phê** - Coffee
- **Đá Xay** - Shaved Ice
- **Topping** - Additional toppings

## AI Integration

### Order Parsing (ai.service.js)
- Uses OpenAI GPT-4 mini model
- Temperature: 0.2 (deterministic)
- Extracts: item names, quantities, sizes
- Validates menu items

### Reply Generation (chat.service.js)
- Persona-based responses
- Temperature: 0.6 (creative but consistent)
- Preserves order info & prices
- Adds natural, friendly touch

### Persona
The bot acts as a friendly mother selling milk tea, with natural Vietnamese communication style.

## Payment System

### VietQR Integration
- Generates QR codes for bank transfers
- Format: `https://img.vietqr.io/image/MB-{ACCOUNT}-compact.png?amount={AMOUNT}&addInfo={ORDER_ID}`
- Customers scan QR and transfer
- Transfer content: `DH{ORDER_ID}` for tracking

### PayOS Integration (Optional)
- Creates payment requests with order details
- Handles payment webhooks
- Marks orders as paid in system
- Fallback to VietQR if PayOS unavailable

## Testing

The project includes comprehensive tests:

### Order Flow Tests (`tests/order.spec.js`)
- Basic order flow
- Size handling (missing, partial, all)
- Multiple items
- Price calculations
- State transitions

### AI Tests (`tests/ai.spec.js`)
- Order parsing
- Handling typos
- Menu validation

## Troubleshooting

### Bot not responding to Telegram messages
- Check `BOT_TOKEN` is correct
- Ensure bot has webhook/polling enabled
- Check internet connection

### OpenAI API errors
- Verify `OPENAI_API_KEY` is valid
- Check API key has credit
- Monitor API usage

### Menu loading issues
- Ensure `Menu.csv` exists in `src/` directory
- Verify CSV format matches template

### Payment QR not showing
- Check `ACCOUNT` environment variable is set
- Verify image URL is accessible

## Project Structure Notes

### State Management
- Currently uses in-memory `userState` map
- Per-customer conversation state tracking
- States: `null`, `ask_size_detail`, `pending`, `confirmed`

### Order Storage
- `order.store.js`: Maintains order history by chatID and orderCode
- `markOrderPaid()`: Updates order status on payment
- Useful for admin dashboard/reporting

### Error Handling
- Graceful fallback to raw messages if AI fails
- Try-catch on all async operations
- Input validation (length, format)

## Alignment with Company Requirements

 **Uses Large Language Models**: OpenAI GPT-4 mini  
 **Customer Communication**: Full Telegram bot integration  
 **Order Support**: Natural language parsing & confirmation  
 **Price Calculation**: Automatic total computation  
 **Payment Integration**: VietQR + PayOS support  
 **Order Summary**: Formatted output for preparation & delivery  
 **Understandable Code**: Well-documented with clear structure  
 **Production Ready**: Error handling, testing, logging  

## Deployment

### Local Testing
```bash
npm start
```

### Production Deployment (Suggested)

1. **Railway/Render/Heroku**:
   ```bash
   # Set environment variables in platform
   # Deploy main branch
   npm start
   ```

2. **VPS (Ubuntu)**:
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Clone and setup
   git clone <repo>
   cd Mommy-ban-tra-sua
   npm install
   npm start
   ```

3. **Docker**:
   ```bash
   docker build -t mommy-bot .
   docker run -d \
     -e BOT_TOKEN="xxx" \
     -e OPENAI_API_KEY="xxx" \
     -p 4300:4300 \
     mommy-bot
   ```

## Author

- Developed for CASSO COMPANY LIMITED Entry Test
- Entry Test: Milk Tea Shop AI Chatbot System

## Support

For issues or questions:
1. Check `.env` configuration
2. Review test cases for examples
3. Check logs for error messages
4. Verify all dependencies are installed

---

**Happy ordering! 🍵** 

*Mẹ bán trà sữa - Powered by AI*
