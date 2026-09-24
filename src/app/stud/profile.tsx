import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Input, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { updateStudProfile } from '../../lib/api';
import { errMsg } from '../../lib/notify';

/** Отдельный профиль для грани Студ конкретного вуза (пустые поля — берутся из общего профиля) */
export default function StudProfile() {
  const { profile, refresh } = useMe();
  const { membership, institution } = useFacet();
  const [name, setName] = useState(membership?.stud_display_name ?? '');
  const [avatar, setAvatar] = useState(membership?.stud_avatar_url ?? '');
  const [bio, setBio] = useState(membership?.stud_bio ?? '');
  const [title, setTitle] = useState(membership?.stud_title ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!membership || !institution) return <Screen topInset={false}><Txt>Сначала войдите в вуз</Txt></Screen>;

  const save = async () => {
    setBusy(true);
    try {
      await updateStudProfile(institution.id, profile.id, {
        stud_display_name: name.trim() || null,
        stud_avatar_url: avatar.trim() || null,
        stud_bio: bio.trim() || null,
        stud_title: title.trim() || null,
      });
      await refresh();
      router.back();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Txt v="dim">Профиль виден только на странице {institution.short_name}. Пустые поля — из общего профиля.</Txt>
      <Input label="Имя в вузе" value={name} onChangeText={setName} placeholder={profile.display_name} />
      <Input label="Подпись (группа, факультет, клуб)" value={title} onChangeText={setTitle} placeholder="ФПМИ, 2 курс" />
      <Input label="О себе" value={bio} onChangeText={setBio} multiline placeholder={profile.bio} />
      <Input label="Ссылка на аватар" value={avatar} onChangeText={setAvatar} autoCapitalize="none" />
      <ErrorText error={error} />
      <Button title="Сохранить" onPress={save} loading={busy} />
    </Screen>
  );
}
