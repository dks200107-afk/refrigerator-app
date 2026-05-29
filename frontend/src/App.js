// frontend/src/App.js

import React, {
  useState,
  useEffect
} from 'react';

import axios from 'axios';

import {
  auth,
  provider,
  db
} from './firebase';

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc
} from 'firebase/firestore';

const API_BASE_URL =
  'https://refrigerator-app-jivi.onrender.com';

function App() {

  const [user, setUser] =
    useState(null);

  const [ingredients, setIngredients] =
    useState([]);

  const [name, setName] =
    useState('');

  const [category, setCategory] =
    useState('냉장');

  const [expiryDate, setExpiryDate] =
    useState('');

  const [quantity, setQuantity] =
    useState(1);

  const [unit, setUnit] =
    useState('개');

  const [recipe, setRecipe] =
    useState('');

  const [shoppingList, setShoppingList] =
    useState([]);

  // ======================
  // 로그인 유지
  // ======================

  useEffect(() => {

    const unsubscribe =
      onAuthStateChanged(
        auth,
        currentUser => {

          setUser(currentUser);

        }
      );

    return () => unsubscribe();

  }, []);

  // ======================
  // 재료 조회
  // ======================

  const fetchIngredients =
    async () => {

      if (!user) return;

      try {

        const querySnapshot =
          await getDocs(
            collection(
              db,
              'users',
              user.uid,
              'ingredients'
            )
          );

        const items = [];

        querySnapshot.forEach(docItem => {

          items.push({
            id: docItem.id,
            ...docItem.data(),
            editing: false
          });

        });

        setIngredients(items);

      } catch (error) {

        console.error(error);

      }

    };

  useEffect(() => {

    if (user) {

      fetchIngredients();

    }

// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ======================
  // 로그인
  // ======================

const handleGoogleLogin =
  async () => {

    try {

      provider.setCustomParameters({
        prompt: 'select_account'
      });

      await signInWithPopup(
        auth,
        provider
      );

    } catch (error) {

      console.error(error);

    }

  };

  // ======================
  // 로그아웃
  // ======================

  const handleLogout =
    async () => {

      await signOut(auth);

    };

  // ======================
  // 추가
  // ======================

  const handleSubmit =
    async (e) => {

      e.preventDefault();

      if (!name || !expiryDate) {

        alert('내용 입력');

        return;

      }

      try {

        await addDoc(
          collection(
            db,
            'users',
            user.uid,
            'ingredients'
          ),
          {
            name,
            category,
            expiryDate,
            quantity,
            unit
          }
        );

        setName('');
        setExpiryDate('');
        setQuantity(1);

        fetchIngredients();

      } catch (error) {

        console.error(error);

      }

    };

  // ======================
  // OCR
  // ======================

  const handleOcrUpload =
    async (e) => {

      const file =
        e.target.files[0];

      if (!file) return;

      const formData =
        new FormData();

      formData.append(
        'receipt',
        file
      );

      alert('OCR 분석 시작');

      try {

        await axios.post(
          `${API_BASE_URL}/api/ocr`,
          formData
        );

        fetchIngredients();

      } catch (error) {

        console.error(error);

      }

    };

  // ======================
  // AI 레시피
  // ======================

  const getAiRecipe =
    async () => {

      setRecipe(
        'AI 레시피 생성 중...'
      );

      try {

        const ingredientNames =
          ingredients
            .map(item => item.name)
            .join(', ');

        const res =
          await axios.get(
            `${API_BASE_URL}/api/ai-recipe`,
            {
              params: {
                ingredients:
                  ingredientNames
              }
            }
          );

        setRecipe(
          res.data.recipe
        );

      } catch (error) {

        setRecipe('AI 오류');

      }

    };

  // ======================
  // 쇼핑리스트
  // ======================

  const getShoppingList =
    () => {

      const list = [];

      ingredients.forEach(item => {

        if (
          item.unit === '%' &&
          item.quantity <= 20
        ) {

          list.push(
            `${item.name} 거의 다 사용함`
          );

        }

        if (
          item.unit === '개' &&
          item.quantity <= 1
        ) {

          list.push(
            `${item.name} 재구매 추천`
          );

        }

      });

      if (list.length === 0) {

        list.push(
          '현재 구매 추천 품목 없음'
        );

      }

      setShoppingList(list);

    };

  // ======================
  // 로그인 안했을 때
  // ======================

  if (!user) {

    return (

      <div
        style={{
          padding: '40px',
          textAlign: 'center'
        }}
      >

        <h1>
          냉장고 관리 프로그램 🧊
        </h1>

        <button
          onClick={
            handleGoogleLogin
          }
          style={{
            padding: '12px 20px',
            border: 'none',
            borderRadius: '8px',
            background: '#4285F4',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Google 로그인
        </button>

      </div>

    );

  }

  return (

    <div
      style={{
        padding: '20px',
        maxWidth: '700px',
        margin: '0 auto',
        fontFamily: 'sans-serif'
      }}
    >

      <h1>
        냉장고 관리 프로그램 🧊
      </h1>

      {/* 로그인 */}

      <div
        style={{
          marginBottom: '20px'
        }}
      >

        <div>
          로그인:
          {' '}
          {user.email}
        </div>

        <button
          onClick={handleLogout}
        >
          로그아웃
        </button>

      </div>

      {/* OCR */}

      <section
        style={{
          marginBottom: '30px'
        }}
      >

        <h3>
          🧾 영수증 OCR 등록
        </h3>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={
            handleOcrUpload
          }
        />

      </section>

      {/* 직접 입력 */}

      <section
        style={{
          marginBottom: '30px'
        }}
      >

        <h3>
          ✏️ 식재료 직접 입력
        </h3>

        <form
          onSubmit={
            handleSubmit
          }
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >

          <input
            type="text"
            placeholder="식재료 이름"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
          />

          <select
            value={category}
            onChange={(e) =>
              setCategory(
                e.target.value
              )
            }
          >

            <option value="냉장">
              냉장
            </option>

            <option value="냉동">
              냉동
            </option>

            <option value="실온">
              실온
            </option>

          </select>

          <input
            type="number"
            placeholder="수량"
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Number(
                  e.target.value
                )
              )
            }
          />

          <select
            value={unit}
            onChange={(e) =>
              setUnit(
                e.target.value
              )
            }
          >

            <option value="개">
              개
            </option>

            <option value="%">
              %
            </option>

          </select>

          <input
            type="date"
            value={expiryDate}
            onChange={(e) =>
              setExpiryDate(
                e.target.value
              )
            }
          />

          <button type="submit">
            등록
          </button>

        </form>

      </section>

      {/* 재고 현황 */}

      <section>

        <h3>
          🛒 냉장고 재고 현황
        </h3>

        {['냉장', '냉동', '실온']
          .map(cat => (

          <div
            key={cat}
            style={{
              marginBottom: '20px'
            }}
          >

            <h4>
              {cat}
            </h4>

            {ingredients
              .filter(
                item =>
                  item.category === cat
              )
              .map(item => (

              <div
                key={item.id}
                style={{
                  background: '#f4f4f4',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '10px'
                }}
              >

                <strong>
                  {item.name}
                </strong>

                <div>
                  수량:
                  {' '}
                  {item.quantity}
                  {item.unit}
                </div>

                <div>
                  유통기한:
                  {' '}
                  {item.expiryDate}
                </div>

                {/* 버튼 */}

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: '10px'
                  }}
                >

                  {/* 수정 */}

                  <button
                    onClick={() => {

                      const updated =
                        ingredients.map(
                          ing => {

                            if (
                              ing.id === item.id
                            ) {

                              return {
                                ...ing,
                                editing:
                                  !ing.editing
                              };

                            }

                            return ing;

                          }
                        );

                      setIngredients(
                        updated
                      );

                    }}
                  >
                    수정
                  </button>

                  {/* 삭제 */}

                  <button
                    onClick={async () => {

                      if (
                        !window.confirm(
                          '삭제하시겠습니까?'
                        )
                      ) {

                        return;

                      }

                      await deleteDoc(
                        doc(
                          db,
                          'users',
                          user.uid,
                          'ingredients',
                          item.id
                        )
                      );

                      fetchIngredients();

                    }}
                  >
                    삭제
                  </button>

                </div>

                {/* 수정 모달 */}

                {item.editing && (

                  <div
                    style={{
                      marginTop: '15px',
                      padding: '10px',
                      background: '#fff',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >

                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  name:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    />

                    <select
                      value={item.category}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  category:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    >

                      <option value="냉장">
                        냉장
                      </option>

                      <option value="냉동">
                        냉동
                      </option>

                      <option value="실온">
                        실온
                      </option>

                    </select>

                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  quantity:
                                    Number(
                                      e.target.value
                                    )
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    />

                    <select
                      value={item.unit}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  unit:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    >

                      <option value="개">
                        개
                      </option>

                      <option value="%">
                        %
                      </option>

                    </select>

                    <input
                      type="date"
                      value={
                        item.expiryDate
                      }
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  expiryDate:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    />

                    <button
                      onClick={async () => {

                        await updateDoc(
                          doc(
                            db,
                            'users',
                            user.uid,
                            'ingredients',
                            item.id
                          ),
                          {
                            name: item.name,
                            category:
                              item.category,
                            quantity:
                              item.quantity,
                            unit: item.unit,
                            expiryDate:
                              item.expiryDate
                          }
                        );

                        fetchIngredients();

                      }}
                    >
                      저장
                    </button>

                  </div>

                )}

              </div>

            ))}

          </div>

        ))}

      </section>

      {/* AI 레시피 */}

      <section
        style={{
          marginTop: '30px'
        }}
      >

        <button
          onClick={getAiRecipe}
        >
          AI 레시피 추천
        </button>

        <pre>
          {recipe}
        </pre>

      </section>

      {/* 쇼핑리스트 */}

      <section
        style={{
          marginTop: '30px'
        }}
      >

        <button
          onClick={getShoppingList}
        >
          쇼핑리스트 보기
        </button>

        <ul>

          {shoppingList.map(
            (item, idx) => (

            <li key={idx}>
              {item}
            </li>

          ))}

        </ul>

      </section>

    </div>

  );

}

export default App;