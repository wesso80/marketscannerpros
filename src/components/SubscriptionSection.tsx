import React from 'react';
import { Platform, View } from 'react-native';
import IosPurchaseButtons from './IosPurchaseButtons';

function WebStripeButtons() {
  return <View>{/* keep your Stripe buttons/links here for web/Android */}</View>;
}

export default function SubscriptionSection() {
  return Platform.OS === 'ios' ? <IosPurchaseButtons/> : <WebStripeButtons/>;
}
