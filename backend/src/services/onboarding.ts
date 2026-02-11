/**
 * Restaurant Onboarding Service
 * Adds new restaurants, validates place IDs, sets up initial data.
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './database.js';
import type { Restaurant } from '../types/models.js';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

interface PlaceDetails {
  name: string;
  formattedAddress: string;
  rating: number;
  userRatingCount: number;
}

/**
 * Validate that a Google Place ID exists and return basic details.
 */
export async function validatePlaceId(placeId: string): Promise<PlaceDetails | null> {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not set');

  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const response = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'displayName,formattedAddress,rating,userRatingCount',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    const err = await response.text();
    throw new Error(`Google Places API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  return {
    name: data.displayName?.text || 'Unknown',
    formattedAddress: data.formattedAddress || '',
    rating: data.rating || 0,
    userRatingCount: data.userRatingCount || 0,
  };
}

/**
 * Add a new restaurant to the system.
 * Fetches place details from Google, stores in database.
 */
export async function addRestaurant(
  placeId: string,
  ownerPhone: string,
  ownerEmail: string = 'owner@example.com',
  options: { tier?: string } = {}
): Promise<Restaurant> {
  // 1. Validate place exists
  const placeDetails = await validatePlaceId(placeId);
  if (!placeDetails) {
    throw new Error(`Place ID "${placeId}" not found on Google`);
  }

  console.log(`📍 Found: ${placeDetails.name} (${placeDetails.formattedAddress})`);
  console.log(`   Rating: ${placeDetails.rating}★ (${placeDetails.userRatingCount} reviews)`);

  // 2. Check if restaurant already exists
  const { data: existing } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('google_place_id', placeId)
    .maybeSingle();

  if (existing) {
    console.log(`⚠️  Restaurant already exists: ${existing.name} (${existing.id})`);
    // Update phone if needed
    await supabase
      .from('restaurants')
      .update({ owner_phone: ownerPhone })
      .eq('id', existing.id);
    
    const { data: updated } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', existing.id)
      .single();
    return updated as Restaurant;
  }

  // 3. Insert new restaurant
  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .insert({
      name: placeDetails.name,
      location: placeDetails.formattedAddress,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      google_place_id: placeId,
      tier: options.tier || 'review_drafts',
      tone_profile_json: {
        tone: 'friendly',
        personality: ['warm', 'genuine'],
        avoid: ['corporate', 'generic'],
        emphasis: ['great food', 'customer service'],
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add restaurant: ${error.message}`);

  console.log(`✅ Restaurant added: ${restaurant.name} (${restaurant.id})`);
  return restaurant as Restaurant;
}
