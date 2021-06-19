require('dotenv').config();
const { Telegraf, Markup, session, Scenes } = require('telegraf');
const { faq, contacts, trips } = require('./config');

const menus = {  
	main: Markup.keyboard(['Поиск туров', 'ЧаВо', 'Выбрать тур', 'Контакты'], { columns: 2 }),
	back: Markup.keyboard(['В меню']),
	where: Markup.keyboard(['Город', 'Море', 'Горы', 'В меню']),
	howTown: Markup.keyboard(['Экскурсия', 'Прогулка', 'В меню']),
	howHills: Markup.keyboard(['Пешком', 'На авто', 'В меню']),
	confirm: Markup.keyboard(['Забронировать', 'Назад']),
	yesNo: Markup.keyboard(['Да', 'Нет']),
};

const searcher = new Scenes.BaseScene('search');
searcher.enter(ctx => ctx.reply('Введите название тура', menus.back));

searcher.hears('В меню', ctx => {
	ctx.reply('Что дальше?', menus.main);
	ctx.scene.leave();
});
searcher.on('text', ctx => {
	const trip = ctx.message.text.trim();
	ctx.session.trips = trips.filter(t => t.name.includes(trip));
	if (!ctx.session.trips.length) return ctx.reply('Ничего не найдено');
	return ctx.scene.enter('trip-list');
});

const quiz = new Scenes.BaseScene('quiz');
quiz.enter(ctx => ctx.reply('Куда хотите отправиться', menus.where));

quiz.hears('В меню', ctx => {
	ctx.reply('Что дальше?', menus.main);
	ctx.scene.leave();
});
quiz.hears(/(Город|Море)/, ctx => {
	ctx.session.where = ctx.message.text.trim();
	return ctx.reply('На чем', menus.howTown);
});
quiz.hears(/(Горы)/, ctx => {
	ctx.session.where = ctx.message.text.trim();
	return ctx.reply('На чем', menus.howHills);
});
quiz.hears(/(Экскурсия|Прогулка|Пешком|На авто)/, ctx => {
	ctx.session.how = ctx.message.text.trim();
	ctx.session.trips = trips.filter(t => t.how === ctx.session.how && t.where === ctx.session.where);
	return ctx.scene.enter('trip-list');
});

const tripList = new Scenes.BaseScene('trip-list');
tripList.enter(ctx => ctx.reply('Подобраные туры', Markup.keyboard([...ctx.session.trips.map(t => t.name), 'В меню'])));

tripList.hears('В меню', ctx => {
	ctx.reply('Что дальше?', menus.main);
	ctx.scene.leave();
});
tripList.hears('Назад', ctx =>
	ctx.reply('Подобраные туры', Markup.keyboard([...ctx.session.trips.map(t => t.name), 'В меню']))
);
tripList.hears('Забронировать', ctx => ctx.scene.enter('personal-info'));
tripList.on('text', async ctx => {
	ctx.session.trip = ctx.session.trips.find(t => t.name === ctx.message.text.trim());
	await ctx.replyWithHTML(`<b>${ctx.session.trip.name}</b>\n\n${ctx.session.trip.text}`, menus.confirm);
	return ctx.replyWithPhoto({ source: './img/' + ctx.session.trip.picture });
});

const personalInfo = new Scenes.WizardScene(
	'personal-info',
	async ctx => {
		await ctx.reply('Введите ФИО', Markup.removeKeyboard());
		return ctx.wizard.next();
	},
	async ctx => {
		ctx.wizard.state.fio = ctx.message.text.trim();
		await ctx.reply('Введите дату рождения');
		return ctx.wizard.next();
	},
	async ctx => {
		ctx.wizard.state.birthday = ctx.message.text.trim();
		await ctx.reply('Введите номер телефона');
		return ctx.wizard.next();
	},
	async ctx => {
		ctx.wizard.state.phone = ctx.message.text.trim();
		await ctx.reply(
			`Всё верно?\nТур:${ctx.session.trip.name}\nФИО:${ctx.wizard.state.fio}\nДень рождения:${ctx.wizard.state.birthday}\nНомер телефона:${ctx.wizard.state.phone}`,
			menus.yesNo
		);
		return ctx.wizard.next();
	},
	async ctx => {
		if (ctx.message.text.trim() === 'Да, сделать бронирование') {
			await ctx.telegram.sendMessage(
				process.env.ADMIN_ID,
				`Тур:${ctx.session.trip.name}\nФИО:${ctx.wizard.state.fio}\nДень рождения:${ctx.wizard.state.birthday}\nНомер телефона:${ctx.wizard.state.phone}`
			);
			await ctx.reply('Тур забронирован');
			return ctx.scene.leave();
		} else {
			await ctx.reply('Введите ФИО', Markup.removeKeyboard());
			return ctx.wizard.selectStep(1);
		}
	}
);
personalInfo.leave(ctx => ctx.reply('Что дальше?', menus.main));

const bot = new Telegraf(process.env.TOKEN);
bot.use(session());

const stage = new Scenes.Stage([searcher, quiz, tripList, personalInfo]);
bot.use(stage.middleware());

bot.hears('ЧаВо', ctx => ctx.replyWithHTML(faq.map(el => `<b>${el.header}</b>\n\n${el.text}`).join('\n\n\n')));
bot.hears('Контакты', ctx => ctx.reply(contacts.join('\n')));
bot.hears('Поиск туров', ctx => ctx.scene.enter('search'));
bot.hears('Выбрать тур', ctx => ctx.scene.enter('quiz'));

bot.start(ctx => ctx.reply('Добро пожаловать!', menus.main));

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
