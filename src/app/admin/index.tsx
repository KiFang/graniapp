import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { Fragment } from 'react';
import { Card, Divider, Empty, ListItem, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { canScanLeaders, isModerator } from '../../lib/leader';
import { FACET_META } from '../../theme/facets';

interface Item {
  title: string;
  subtitle?: string;
  href: Href;
}

/**
 * Админ-панель: всё управление в одном месте, чтобы не перегружать профиль.
 * Сверху — инструменты по правам (лидеры, президенты, модераторы), ниже — отдельный блок только для Основателя.
 */
export default function AdminPanelScreen() {
  const { staff, memberships } = useMe();
  const { facet, membership, institution, can, isFounder } = useFacet();

  const leader: Item[] = [];
  if (facet === 'stud' && membership && (['president', 'vice_president'].includes(membership.role) || isFounder)) {
    leader.push({ title: 'Управление вузом', subtitle: 'Цвета, коды, роли, президентство', href: '/stud/manage' });
  }
  if (can('manage_events') && (facet !== 'stud' || institution)) {
    leader.push({
      title: 'Discord-канал',
      subtitle: 'Турниры, результаты и победители — в ваш канал Discord',
      href: '/admin/discord',
    });
  }
  if (canScanLeaders(staff, memberships)) leader.push({ title: 'Сканер Leader ID', subtitle: 'Проверить удостоверение лидера', href: '/leader-scan' });
  if (isModerator(staff)) leader.push({ title: 'Модерация аватарок', subtitle: 'Жалобы и скрытые картинки', href: '/admin/moderation' });
  if (!isFounder && staff?.permissions.includes('view_users')) leader.push({ title: 'Все пользователи', subtitle: 'Список и поиск', href: '/admin/users' });
  if (!isFounder && staff?.permissions.includes('manage_shop')) leader.push({ title: 'Управление магазином', subtitle: 'Товары и выдача наград', href: '/admin/shop' });

  const founder: Item[] = isFounder
    ? [
        { title: 'Все пользователи', subtitle: 'Список, поиск и назначение ролей', href: '/admin/users' },
        { title: 'Лидеры Изнанки и Инто', subtitle: 'Роли и права лидеров', href: '/admin/inside' },
        { title: 'Учебные заведения', subtitle: 'Вузы, коды, президенты', href: '/admin/institutions' },
        { title: 'Управление магазином', subtitle: 'Товары и выдача наград', href: '/admin/shop' },
      ]
    : [];

  return (
    <Screen topInset={false}>
      {!leader.length && !founder.length ? (
        <Empty icon="🛠" title="Здесь пока пусто" hint="Инструменты появятся, когда Основатель или президент выдаст права" />
      ) : null}
      {leader.length ? (
        <>
          <Txt v="label">
            Управление · {facet === 'stud' ? (institution?.short_name ?? 'Студ') : FACET_META[facet].name}
          </Txt>
          <Group items={leader} />
          <Txt v="small">Инструменты зависят от грани — переключите её каплей, чтобы управлять в другой.</Txt>
        </>
      ) : null}
      {founder.length ? (
        <>
          <Txt v="label">Только для Основателя</Txt>
          <Group items={founder} />
        </>
      ) : null}
    </Screen>
  );
}

function Group({ items }: { items: Item[] }) {
  return (
    <Card>
      {items.map((it, i) => (
        <Fragment key={it.title}>
          {i > 0 ? <Divider /> : null}
          <ListItem title={it.title} subtitle={it.subtitle} onPress={() => router.push(it.href)} right={<Feather name="chevron-right" size={18} color="#555" />} />
        </Fragment>
      ))}
    </Card>
  );
}
