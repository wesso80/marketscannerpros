/** Both entry cycles and the independent exit pass carry monitoring evidence. */
export function latestCryptoCycle<T extends {title:string;createdAt:string;evidence?:string[]}>(journal:T[]):T|undefined {
 return journal.filter(j=>['Crypto paper cycle completed','Crypto paper exit monitoring completed'].includes(j.title))
  .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
}
