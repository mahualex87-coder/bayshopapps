import type { MessageCatalog } from './core';
export const cancellationMessages: MessageCatalog = {
  'cancellation.title': { ro: 'Anularea comenzii', ru: 'Отмена заказа', en: 'Order cancellation' },
  'cancellation.available': { ro: 'Poți anula comanda cât timp cumpărarea nu a început.', ru: 'Заказ можно отменить, пока выкуп ещё не начался.', en: 'You can cancel this order before purchasing begins.' },
  'cancellation.action': { ro: 'Anulează comanda', ru: 'Отменить заказ', en: 'Cancel order' },
  'cancellation.question': { ro: 'Confirmi anularea acestei comenzi?', ru: 'Подтвердить отмену этого заказа?', en: 'Confirm cancellation of this order?' },
  'cancellation.balanceHint': { ro: 'BayShop va restitui în sold sumele eligibile achitate pentru comandă. Aceasta nu este o rambursare pe card.', ru: 'BayShop вернёт на баланс подлежащие возврату суммы, оплаченные за заказ. Это не возврат на карту.', en: 'BayShop will return eligible amounts paid for this order to your account balance. This is not a refund to your card.' },
  'cancellation.confirm': { ro: 'Da, anulează comanda', ru: 'Да, отменить заказ', en: 'Yes, cancel order' },
  'cancellation.keep': { ro: 'Păstrează comanda', ru: 'Оставить заказ', en: 'Keep order' },
  'cancellation.changed': { ro: 'Starea sau suma comenzii s-a schimbat. Anularea nu a fost trimisă; verifică detaliile actuale.', ru: 'Статус или сумма заказа изменились. Запрос отмены не отправлен; проверьте актуальные данные.', en: 'The order status or amount changed. Cancellation was not submitted; check the current details.' },
  'cancellation.confirmed': { ro: 'Anularea comenzii este confirmată de BayShop.', ru: 'Отмена заказа подтверждена BayShop.', en: 'BayShop has confirmed the order cancellation.' },
  'cancellation.unconfirmed': { ro: 'Rezultatul anulării nu este încă verificat în cont.', ru: 'Результат отмены ещё не проверен в аккаунте.', en: 'The cancellation result has not yet been verified in your account.' },
  'cancellation.noRepeat': { ro: 'Verifică starea actuală. Nu trimitem automat o altă anulare.', ru: 'Проверьте текущий статус. Повторный запрос отмены автоматически не отправляется.', en: 'Check the current status. Another cancellation request will not be sent automatically.' },
  'cancellation.check': { ro: 'Verifică starea comenzii', ru: 'Проверить статус заказа', en: 'Check order status' },
};
