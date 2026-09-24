import { router } from 'expo-router';
import { useState } from 'react';
import { ImageField } from '../components/ImageField';
import { Button, ErrorText, Input, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { updateProfile } from '../lib/api';
import { removeImage } from '../lib/media';
import { errMsg } from '../lib/notify';

export default function ProfileEdit() {
  const { profile, refresh } = useMe();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile(profile.id, {
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        avatar_url: avatar,
      });
      // старое фото из нашего хранилища больше не нужно
      if (profile.avatar_url && profile.avatar_url !== avatar) removeImage(profile.avatar_url);
      await refresh();
      router.back();
    } catch (e) {
      setError(errMsg(e).includes('duplicate') ? 'Этот ник уже занят' : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Input label="Имя" value={displayName} onChangeText={setDisplayName} />
      <Input label="Ник" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <Input label="О себе" value={bio} onChangeText={setBio} multiline />
      <ImageField
        label="Аватар"
        kind="avatar"
        ownerId={profile.id}
        value={avatar}
        onChange={setAvatar}
        placeholder={(displayName || profile.username).slice(0, 1).toUpperCase()}
      />
      <Txt v="small">Титулы и рамки надеваются в магазине наград. Профиль общий для всех граней; для Студ можно настроить отдельный.</Txt>
      <ErrorText error={error} />
      <Button title="Сохранить" onPress={save} loading={busy} />
    </Screen>
  );
}
