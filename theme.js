export const COLORS = {
  background: '#fbf9f6',
  cardBackground: '#ffffff',
  cardSecondary: '#f4f1ea',
  borderPrimary: '#dcd6ce',
  borderSecondary: '#e4dfd5',
  textPrimary: '#2c3531',
  textSecondary: '#7f8c8d',
  textMuted: '#9e958d',
  primary: '#587b73',
  primaryDark: '#3a5a40',
  danger: '#bc4749',
  white: '#ffffff',
  overlay: 'rgba(0,0,0,0.4)',
};

export const globalStyles = {
  screenWrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.cardBackground,
  },
  btnPrimary: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 5,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
};