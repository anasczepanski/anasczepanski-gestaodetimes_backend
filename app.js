const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const memberRoutes = require('./routes/memberRoutes');
const taskRoutes = require('./routes/taskRoutes');
const errorHandler = require('./middleware/errorHandler');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
require('dotenv').config();

// Inicialização do Firebase Admin SDK com a chave do service account
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o seu arquivo JSON
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// Configuração do transporter de e-mail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use('/members', memberRoutes);
app.use('/tasks', taskRoutes);

// Middleware de tratamento de erros
app.use(errorHandler);

// Função para enviar notificações
const sendNotification = (token, task) => {
  const message = {
    notification: {
      title: "Lembrete de Prazo de Tarefa",
      body: `A tarefa "${task.description}" está próxima do prazo.`,
    },
    token: token,
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log("Mensagem enviada com sucesso:", response);
    })
    .catch((error) => {
      console.log("Erro ao enviar mensagem:", error);
    });
};

// Função para verificar prazos das tarefas e enviar notificações
const checkTaskDeadlines = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  try {
    const tasksSnapshot = await db.collection('tasks')
      .where('deadline', '>=', admin.firestore.Timestamp.fromDate(today))
      .where('deadline', '<', admin.firestore.Timestamp.fromDate(tomorrow))
      .get();

    tasksSnapshot.forEach(async (doc) => {
      const task = doc.data();
      const userRef = await db.collection('members').doc(task.assignedTo).get();
      const user = userRef.data();

      if (user && user.notificationToken) {
        sendNotification(user.notificationToken, task);
      } else {
        console.log("Usuário não possui um token de notificação válido");
      }

      // Enviar email também
      if (user && user.email) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Lembrete de Prazo de Tarefa',
          text: `Olá ${user.name}, a tarefa "${task.description}" está próxima do prazo. Por favor, verifique-a!`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log('Erro ao enviar email:', error);
          }
          console.log('Email enviado:', info.response);
        });
      }
    });
  } catch (error) {
    console.error("Erro ao verificar os prazos das tarefas:", error);
  }
};

// Agendar uma tarefa para rodar todos os dias à meia-noite
cron.schedule('0 0 * * *', async () => {
  console.log('Cron job rodando...');
  await checkTaskDeadlines();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
