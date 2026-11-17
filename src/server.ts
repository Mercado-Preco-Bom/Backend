import express from 'express';
import cors from 'cors';
import userRoutes from './routes/userRoutes';
import costumerRoutes from './routes/clientRoutes';
import deliveryRoutes from './routes/deliveryRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();

app.use(cors());
app.use(express.json());

// Rota de Health Check para nao deixar o backend no render cair
app.get('/api/ping', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor PreçoBom acordado!' });
});

// Routes do sistema
app.use('/api/users', userRoutes);
app.use('/api', costumerRoutes);
app.use('/api', deliveryRoutes);
app.use('/api', adminRoutes);



const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 O servidor está rodando na porta:  ${PORT}!`);
});
